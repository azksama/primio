import { expect, it } from 'vitest'
import { featuredSelection } from './featured'
import type { Meta } from './types'

it('rotates one movie, one series and one anime without classifying anime as series', () => {
  const items: Meta[] = [
    { id: 'a', type: 'series', name: 'Anime', category: 'anime' },
    { id: 's', type: 'series', name: 'Series' },
    { id: 'm', type: 'movie', name: 'Movie', genres: ['Drama'] },
    { id: 'n', type: 'movie', name: 'New movie', genres: ['Drama'] },
  ]
  expect(featuredSelection(items, [items[2]]).map((x) => x.meta.id)).toEqual(['n', 's', 'a'])
  expect(featuredSelection(items.slice(0, 1), []).map((x) => x.category)).toEqual(['anime'])
  expect(featuredSelection([], [])).toEqual([])
})
