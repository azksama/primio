import { afterEach, expect, it, vi } from 'vitest'
import { clearMetadataCache, metadata, mergeMetadata } from './addons'
import type { Addon } from './types'
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }))
const meta = {
  id: 'tt1',
  type: 'series',
  name: 'Catalog title',
  poster: 'https://example.org/poster.jpg',
}
const addon = (name: string): Addon => ({
  url: `https://${name}.example/manifest.json`,
  enabled: true,
  manifest: { id: name, name, version: '1', types: ['series'], resources: ['meta'] },
})
afterEach(() => {
  vi.unstubAllGlobals()
  clearMetadataCache()
})
it('fills an incomplete high-priority response from the next addon without erasing artwork', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify({
            meta: url.includes('first')
              ? { ...meta, name: 'Preferred title', poster: '', description: 'Synopsis' }
              : {
                  ...meta,
                  name: 'Secondary title',
                  genres: ['Drama'],
                  cast: ['Actor'],
                  director: ['Director'],
                  videos: [{ id: 'e1', title: 'Episode' }],
                },
          }),
        ),
    ),
  )
  const result = await metadata([addon('first'), addon('second')], meta)
  expect(result.name).toBe('Preferred title')
  expect(result.poster).toBe(meta.poster)
  expect(result.cast).toEqual(['Actor'])
  expect(result.videos).toHaveLength(1)
  expect(result.metadataStatus).toBe('loaded')
})
it('coalesces concurrent lookups and reuses a successful response', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          meta: {
            ...meta,
            description: 'Synopsis',
            genres: ['Drama'],
            videos: [{ id: 'e1', title: 'Episode' }],
          },
        }),
      ),
  )
  vi.stubGlobal('fetch', fetch)
  await Promise.all([metadata([addon('first')], meta), metadata([addon('first')], meta)])
  await metadata([addon('first')], meta)
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('does not cache a network failure and retries explicitly', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(Error('offline'))
    .mockResolvedValue(
      new Response(JSON.stringify({ meta: { ...meta, description: 'Recovered' } })),
    )
  vi.stubGlobal('fetch', fetch)
  expect((await metadata([addon('first')], meta)).metadataStatus).toBe('unavailable')
  expect((await metadata([addon('first')], meta, { refresh: true })).description).toBe('Recovered')
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('fills episodes by id and keeps higher-priority non-empty descriptions', () => {
  const result = mergeMetadata(
    { ...meta, description: 'Original', videos: [{ id: 'e1', title: '', episode: 1 }] },
    {
      ...meta,
      description: 'Other',
      videos: [
        { id: 'e1', title: 'Episode', thumbnail: 'image' },
        { id: 'e2', title: 'Second', episode: 2 },
      ],
    },
  )
  expect(result.description).toBe('Original')
  expect(result.videos?.[0].title).toBe('Episode')
  expect(result.videos).toHaveLength(2)
})
it('ignores malformed scalar fields and completes them from a healthy addon', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify({
            meta: url.includes('first')
              ? { ...meta, description: { text: 'invalid' }, genres: 'Drama', cast: [null, 2] }
              : {
                  ...meta,
                  description: 'Healthy synopsis',
                  genres: ['Drama'],
                  videos: [{ id: 'e1', title: 'Episode' }],
                },
          }),
        ),
    ),
  )
  const result = await metadata([addon('first'), addon('second')], meta)
  expect(result.description).toBe('Healthy synopsis')
  expect(result.genres).toEqual(['Drama'])
  expect(result.cast).toEqual([])
  expect(result.metadataStatus).toBe('loaded')
})
it('retries against a changed addon configuration rather than reusing the old cache', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          meta: {
            ...meta,
            description: 'Synopsis',
            genres: ['Drama'],
            videos: [{ id: 'e1', title: 'Episode' }],
          },
        }),
      ),
  )
  vi.stubGlobal('fetch', fetch)
  await metadata([addon('first')], meta)
  await metadata([addon('second')], meta)
  expect(fetch).toHaveBeenCalledTimes(2)
})
