import { describe, expect, it } from 'vitest'
import { sortCatalog } from './catalog-sort'
const items = [
  { id: 'a', type: 'movie', name: 'Title 10', imdbRating: '8,5', releaseInfo: '2024–2026' },
  { id: 'b', type: 'movie', name: 'Title 2', imdbRating: '9.1', releaseInfo: '2020' },
  { id: 'c', type: 'movie', name: 'Alpha' },
]
describe('catalog sorting', () => {
  it('sorts names naturally without mutating addon order', () => {
    expect(sortCatalog(items, { key: 'name', direction: 'asc' }).map((m) => m.id)).toEqual([
      'c',
      'b',
      'a',
    ])
    expect(items.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })
  it('keeps unknown ratings and years last in both directions', () => {
    for (const key of ['rating', 'year'] as const) {
      expect(sortCatalog(items, { key, direction: 'asc' }).at(-1)?.id).toBe('c')
      expect(sortCatalog(items, { key, direction: 'desc' }).at(-1)?.id).toBe('c')
    }
    expect(sortCatalog(items, { key: 'rating', direction: 'desc' })[0].id).toBe('b')
    expect(sortCatalog(items, { key: 'year', direction: 'desc' })[0].id).toBe('a')
  })
})
