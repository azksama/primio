import { afterEach, expect, it, vi } from 'vitest'
import { catalog, inspectAddon, metadata, clearMetadataCache, streams, subtitles } from './addons'
import { createCatalogPager } from './catalog-pager'
import { sourceLanguages } from './sources'
import { parseAddonMeta } from './addon-responses'
import { createIntroSkipper } from '@primio/intro-skipper'
import type { Addon } from './types'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }))
const addon: Addon = {
  url: 'https://example.org/manifest.json', enabled: true,
  manifest: { id: 'example', name: 'Example', version: '1', types: ['series'], resources: ['catalog', 'meta', 'stream', 'subtitles'] },
}
const respond = (value: unknown) => new Response(JSON.stringify(value))
afterEach(() => { vi.unstubAllGlobals(); clearMetadataCache() })

it('preserves exact MAL identifiers consumed by AniSkip instead of falling back to title matching', async () => {
  for (const identity of [{ malId: '123' }, { idMal: '456' }]) {
    const meta = parseAddonMeta({ id: 'provider:anime', type: 'anime', name: 'Anime', ...identity,
      videos: [{ id: 'episode', title: 'Episode', season: 1, episode: 1 }] })!
    const urls: string[] = []
    const skipper = createIntroSkipper(async <T>(url: string) => { urls.push(url); return { found: false } as T })
    await skipper.resolve(meta, 'episode', { aniSkip: true, skipIntro: false })
    expect(urls).toEqual([expect.stringContaining(`/skip-times/${identity.malId ?? identity.idMal}/1?`)])
  }
  for (const id of [0, -1, 1.5, Infinity, {}, 'invalid', '0', '1.5']) {
    const meta = parseAddonMeta({ id: 'a', type: 'anime', name: 'A', malId: id, idMal: id })
    expect(meta).not.toHaveProperty('malId')
    expect(meta).not.toHaveProperty('idMal')
  }
})

it('rejects malformed capability restrictions before an addon reaches the UI', async () => {
  for (const changes of [
    { resources: [null] }, { resources: [{ name: 'meta', types: 'series' }] },
    { idPrefixes: 'tt' }, { catalogs: [{ id: 'top', type: 'series', extra: [null] }] },
    { description: { text: 'not renderable' } },
  ]) {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ ...addon.manifest, ...changes })))
    await expect(inspectAddon(addon.url)).rejects.toThrow(/manifest/i)
  }
})

it('normalizes catalog and episode fields and preserves provider pagination offsets', async () => {
  const fetch = vi.fn(async (url: string) => respond({ metas: url.includes('skip=100')
    ? [{ id: 'next', type: 'series', name: 'Next' }]
    : Array.from({ length: 100 }, (_, i) => i === 0 ? null : {
        id: String(i), type: 'series', name: 'Series', genres: [null, 'Drama'],
        country: [null, 'US'], trailers: [null], rating: 'not numeric',
        videos: [{ id: 'episode', name: 'Episode', season: {}, released: 4, overview: {} }],
      }),
  }))
  vi.stubGlobal('fetch', fetch)
  const pager = createCatalogPager([{ addon, catalog: { id: 'top', type: 'series', extra: [{ name: 'skip' }] } }], '')
  const first = await pager.load()
  expect(first.items).toHaveLength(99)
  expect(first.items[0]).toMatchObject({ genres: ['Drama'], country: ['US'], videos: [{ id: 'episode', title: 'Episode' }] })
  expect(first.items[0].videos?.[0].season).toBeUndefined()
  expect(first.hasMore).toBe(true)
  expect((await pager.load()).items).toHaveLength(100)
  expect(fetch.mock.calls[1][0]).toContain('/skip=100.json')
})

it('normalizes detail payloads without allowing another title to replace the requested one', async () => {
  const base = { id: 'series', type: 'series', name: 'Catalog' }
  vi.stubGlobal('fetch', vi.fn(async () => respond({ meta: { ...base, videos: [null, { id: 'e1', title: {}, name: 'Episode', released: {} }] } })))
  expect((await metadata([addon], base)).videos).toEqual([{ id: 'e1', title: 'Episode', name: 'Episode' }])
  vi.stubGlobal('fetch', vi.fn(async () => respond({ meta: { ...base, id: 'different' } })))
  expect((await metadata([addon], base, { refresh: true })).metadataStatus).toBe('unavailable')
})

it('isolates malformed stream languages, headers and subtitles from rendering and native playback', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => respond({ streams: [null, {
    url: 'https://media.example/movie.mp4', title: { invalid: true },
    audioLanguages: [null, 'en', 4], subtitleLanguages: 'fra',
    subtitles: [null, { id: 's1', url: 'https://media.example/sub.vtt', lang: 'fr' }, { lang: 4 }],
    behaviorHints: { filename: {}, proxyHeaders: { request: { 'User-Agent': 'Primio', Invalid: [] } } },
  }] })))
  const result = await streams([addon], 'series', 'episode')
  expect(result.items).toHaveLength(1)
  expect(sourceLanguages(result.items[0])).toEqual({ audio: ['eng'], subtitles: ['fra'] })
  expect(result.items[0].title).toBeUndefined()
  expect(result.items[0].behaviorHints?.proxyHeaders?.request).toEqual({ 'User-Agent': 'Primio' })
  vi.stubGlobal('fetch', vi.fn(async () => respond({ subtitles: [null, { id: 's', url: 'https://example.org/sub', lang: 'eng' }] })))
  expect(await subtitles([addon], 'series', 'episode')).toEqual([{ id: 's', url: 'https://example.org/sub', lang: 'eng' }])
})

it('treats a malformed catalog envelope as a failed provider instead of a successful empty feed', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => respond({ metas: {} })))
  await expect(catalog(addon, 'series', 'top')).rejects.toThrow('Invalid catalog response')
})
