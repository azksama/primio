import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  affinity,
  durationMinutes,
  discoveryPool,
  fuzzyScore,
  matchesDiscovery,
  parseDiscoveryQuery,
} from './discovery'
import { createPin, hashPin } from './profile-pin'
import type { Addon } from './types'
afterEach(() => vi.unstubAllGlobals())
const movie = {
  id: 'm',
  type: 'movie',
  name: 'Test',
  releaseInfo: '1995',
  runtime: '1h 45min',
  imdbRating: '8.2',
  country: 'Japan',
  genres: ['Sci-Fi'],
  cast: ['Actor'],
  director: ['Director'],
}
describe('discovery', () => {
  it('searches all categories when the visible category is all, including addon-only anime', async () => {
    const types = ['movie', 'series', 'anime']
    const addon: Addon = {
      url: 'https://discovery.invalid/manifest.json', enabled: true,
      manifest: { id: 'discovery', name: 'Discovery', version: '1', types, resources: ['catalog'],
        catalogs: types.map(type => ({ type, id: type, extra: [{ name: 'search' }] })) },
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const type = new URL(url).pathname.split('/')[2]
      return new Response(JSON.stringify({ metas: [{ id: type + '-result', type, name: 'Result ' + type }] }))
    }))
    const result = await discoveryPool([addon], 'result', [], 'all')
    expect(result.map(meta => meta.type)).toEqual(types)
    expect(result.find(meta => meta.type === 'anime')).toMatchObject({ id: 'anime-result', category: 'anime' })
  })
  it('combines natural Japanese 90s SF criteria', () => {
    const parsed = parseDiscoveryQuery('films de SF japonais des années 90')
    expect(parsed.filters).toEqual({
      type: 'movie',
      genre: 'Science Fiction',
      country: 'JP',
      from: 1990,
      to: 1999,
    })
    expect(parsed.query).toBe('')
    expect(matchesDiscovery(movie, parsed.filters)).toBe(true)
  })
  it('strictly excludes missing constrained metadata', () => {
    expect(matchesDiscovery({ ...movie, runtime: undefined }, { minutes: 120 })).toBe(false)
    expect(matchesDiscovery({ ...movie, imdbRating: undefined }, { rating: 7.5 })).toBe(false)
    expect(matchesDiscovery({ ...movie, country: undefined }, { country: 'JP' })).toBe(false)
  })
  it('under 2 hours excludes a 120 minute film', () => {
    const p = parseDiscoveryQuery('thriller de moins de 2 heures')
    expect(p.filters).toEqual({ genre: 'Thriller', minutes: 119 })
    expect(p.query).toBe('')
    expect(matchesDiscovery({ ...movie, genres: ['Thriller'], runtime: '120' }, p.filters)).toBe(
      false,
    )
  })
  it('extracts similarity target and category', () =>
    expect(parseDiscoveryQuery('anime similaire à Cyberpunk Edgerunners')).toEqual({
      query: 'cyberpunk edgerunners',
      similar: 'cyberpunk edgerunners',
      filters: { type: 'anime' },
    }))
  it('ranks prefixes before spelling corrections', () => {
    expect(fuzzyScore('One Punch Man', 'One')).toBeGreaterThan(fuzzyScore('One Punch Man', 'Panch'))
    expect(fuzzyScore('Interstellar', 'Interstelar')).toBeGreaterThan(0)
    expect(fuzzyScore('Dune', 'Dog')).toBe(0)
  })
  it('parses hour and minute runtime without inventing a missing value', () => {
    expect(durationMinutes('1h 45min')).toBe(105)
    expect(durationMinutes('95 min')).toBe(95)
    expect(durationMinutes('unknown')).toBeUndefined()
  })
  it('uses multiple seeds and actor/director affinity', () => {
    const seed = { ...movie, id: 's' }
    expect(affinity(movie, [seed, seed]).score).toBe(affinity(movie, [seed]).score * 2)
    expect(affinity(movie, [seed]).reasons).toContain('Même réalisateur')
    expect(affinity({ ...movie, genres: ['Comedy'] }, [], 'funnier').score).toBeGreaterThan(
      affinity(movie, [], 'funnier').score,
    )
  })
})
describe('profile PIN', () => {
  it('stores salted hashes and rejects a wrong code', async () => {
    const a = await createPin('123456')
    const b = await createPin('123456')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toContain('123456')
    expect(await hashPin('123456', a.salt)).toBe(a.hash)
    expect(await hashPin('654321', a.salt)).not.toBe(a.hash)
  })
  it('requires 4 to 8 digits', async () => {
    await expect(createPin('abc1')).rejects.toThrow()
    await expect(createPin('123')).rejects.toThrow()
  })
})
