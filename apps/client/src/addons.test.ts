import { it, expect } from 'vitest'
import { manifestUrl, resourceUrl, supports, playbackUrl } from './addons'
import type { Addon } from './types'
import { createCatalogPager, catalogTargets, type CatalogTarget } from './catalog-pager'
const a: Addon = {
  url: 'https://example.org/secret/manifest.json',
  enabled: true,
  manifest: {
    id: 'x',
    name: 'x',
    version: '1',
    types: ['movie'],
    resources: [{ name: 'stream', types: ['movie'], idPrefixes: ['tt'] }],
  },
}
it('preserves configured path and encodes identifiers once', () => {
  expect(manifestUrl('stremio://example.org/secret/manifest.json')).toBe(a.url)
  expect(resourceUrl(a, 'stream', 'movie', 'tt1:2:3')).toBe(
    'https://example.org/secret/stream/movie/tt1%3A2%3A3.json',
  )
  expect(resourceUrl(a, 'catalog', 'movie', 'top', { search: 'a/b & c' })).toContain(
    'search=a%2Fb%20%26%20c.json',
  )
})
it('filters resource capabilities and disabled addons', () => {
  expect(supports(a, 'stream', 'movie', 'tt123')).toBe(true)
  expect(supports(a, 'stream', 'series', 'tt123')).toBe(false)
  expect(supports(a, 'stream', 'movie', 'kitsu1')).toBe(false)
  expect(supports({ ...a, enabled: false }, 'stream', 'movie', 'tt123')).toBe(false)
})
it('rejects unsafe manifests and does not pretend torrents are playable URLs', () => {
  expect(() => manifestUrl('http://example.org')).toThrow()
  expect(() => manifestUrl('https://user:pass@example.org')).toThrow()
  expect(() => playbackUrl({ infoHash: 'x' })).toThrow()
  expect(() => playbackUrl({ url: 'file:///data/private' })).toThrow()
})

it('paginates each provider independently and stops repeated pages', async () => {
  const target: CatalogTarget = {
    addon: a,
    catalog: { id: 'top', type: 'movie', extra: [{ name: 'skip' }] },
  }
  const calls: (Record<string, string> | undefined)[] = []
  const page = Array.from({ length: 100 }, (_, n) => ({
    id: String(n),
    type: 'movie',
    name: String(n),
  }))
  const pager = createCatalogPager([target], '', async (_a, _t, _id, extra) => {
    calls.push(extra)
    return page
  })
  expect((await pager.load()).hasMore).toBe(true)
  const repeated = await pager.load()
  expect(calls).toEqual([{}, { skip: '100' }])
  expect(repeated.items).toHaveLength(100)
  expect(repeated.hasMore).toBe(false)
})

it('keeps results on failure and retries the same offset without overlapping requests', async () => {
  let requests = 0
  const pager = createCatalogPager(
    [{ addon: a, catalog: { id: 'top', type: 'movie' } }],
    'demo',
    async () => {
      if (++requests === 1) throw Error('Unavailable')
      return [{ id: 'ok', type: 'movie', name: 'Demo' }]
    },
  )
  const first = pager.load()
  expect(pager.load()).toBe(first)
  expect(await first).toMatchObject({ failed: true, hasMore: true })
  expect(await pager.load()).toMatchObject({ failed: false, hasMore: false, items: [{ id: 'ok' }] })
  expect(requests).toBe(2)
})

it('defers providers in groups of three and never pages addons without skip support', async () => {
  const targets = Array.from({ length: 4 }, (_, i) => ({
    addon: a,
    catalog: { id: String(i), type: 'movie' },
  }))
  const calls: string[] = []
  const pager = createCatalogPager(targets, '', async (_a, _t, id) => {
    calls.push(id)
    return Array.from({ length: 100 }, (_, n) => ({ id: id + n, type: 'movie', name: 'Demo' }))
  })
  expect((await pager.load()).hasMore).toBe(true)
  expect(calls).toEqual(['0', '1', '2'])
  expect((await pager.load()).hasMore).toBe(false)
  expect(calls).toEqual(['0', '1', '2', '3'])
})

it('selects an exact catalogue and excludes search-only feeds until a query exists', () => {
  const addon: Addon = {
    ...a,
    manifest: {
      ...a.manifest,
      catalogs: [
        { id: 'top', type: 'movie' },
        { id: 'search', type: 'movie', extra: [{ name: 'search', isRequired: true }] },
      ],
    },
  }
  expect(catalogTargets([addon], 'movie', 'all', '')).toHaveLength(1)
  expect(catalogTargets([addon], 'movie', a.url + '|movie|search', 'demo')[0].catalog.id).toBe(
    'search',
  )
  expect(catalogTargets([{ ...addon, enabled: false }], 'movie', 'all', '')).toEqual([])
})

it('applies anime catalogue choice and sends a supported genre to the provider', async () => {
  const addon: Addon = {
    ...a,
    manifest: {
      ...a.manifest,
      name: 'Anime',
      catalogs: [
        {
          id: 'one',
          type: 'series',
          extra: [{ name: 'genre', isRequired: true, options: ['Action'] }],
        },
        { id: 'two', type: 'series' },
      ],
    },
  }
  expect(catalogTargets([addon], 'anime', 'all', '', true)).toHaveLength(1)
  const targets = catalogTargets([addon], 'anime', addon.url + '|series|one', '', true, 'Action')
  expect(targets).toHaveLength(1)
  let extra: Record<string, string> | undefined
  await createCatalogPager(
    targets,
    '',
    async (_a, _t, _id, e) => {
      extra = e
      return []
    },
    'Action',
  ).load()
  expect(extra).toEqual({ genre: 'Action' })
  expect(catalogTargets([addon], 'anime', 'all', '', true, 'Comedy')).toHaveLength(0)
})
