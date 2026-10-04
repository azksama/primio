import { describe, expect, it } from 'vitest'
import { collectionMembers, matchesRules, sortCollection, validRules } from './collection-rules'
import { collectionKey } from './library-key'
import { createState, defaults, snapshotState, switchProfile } from './preferences'
import { mergeAccount, syncSnapshot } from './account-sync'
import type { Collection, CollectionCondition, CollectionRules, Meta } from './types'

const anime: Meta = {
  id: 'a',
  type: 'series',
  category: 'anime',
  name: 'Été',
  genres: ['Science Fiction'],
  rating: 8,
  releaseInfo: '2025',
  runtime: '24 min',
}
const movie: Meta = {
  id: 'b',
  type: 'movie',
  name: 'Beta',
  genres: ['Comedy'],
  rating: 7,
  releaseInfo: '2020',
  runtime: '90 min',
}
const unknown: Meta = { id: 'c', type: 'movie', name: 'Unknown' }
const condition = (
  field: CollectionCondition['field'],
  value: string,
  operator: CollectionCondition['operator'] = 'is',
  to?: string,
): CollectionCondition => ({ id: field, field, value, operator, to })
const rules = (
  conditions: CollectionCondition[],
  match: 'all' | 'any' = 'all',
): CollectionRules => ({ version: 1, match: 'all', groups: [{ id: 'g', match, conditions }] })
describe('Smart collection rules', () => {
  it('combines AND within groups and OR across groups', () => {
    const r = rules([condition('type', 'anime'), condition('rating', '7.5', 'gte')])
    r.match = 'any'
    r.groups.push({
      id: 'other',
      match: 'all',
      conditions: [condition('type', 'movie'), condition('runtime', '100', 'lte')],
    })
    expect([anime, movie, unknown].filter((m) => matchesRules(m, r, [], defaults))).toEqual([
      anime,
      movie,
    ])
    r.match = 'all'
    expect([anime, movie].filter((m) => matchesRules(m, r, [], defaults))).toEqual([])
  })
  it('supports ranges, exclusions and accent-insensitive text', () => {
    expect(
      matchesRules(
        anime,
        rules([
          condition('year', '2020', 'between', '2026'),
          condition('name', 'ete', 'contains'),
          condition('genre', 'Comedy', 'not'),
        ]),
        [],
        defaults,
      ),
    ).toBe(true)
    expect(
      matchesRules(anime, rules([condition('name', 'ete', 'not_contains')]), [], defaults),
    ).toBe(false)
    expect(
      matchesRules(
        { ...movie, runtime: '2h 15min', country: 'Japan' },
        rules([condition('runtime', '135', 'is'), condition('country', 'JP')]),
        [],
        defaults,
      ),
    ).toBe(true)
  })
  it('does not treat missing metadata as zero or as a negative match', () => {
    for (const c of [
      condition('rating', '8', 'not'),
      condition('runtime', '120', 'lte'),
      condition('genre', 'Comedy', 'not'),
    ])
      expect(matchesRules(unknown, rules([c]), [], defaults)).toBe(false)
    expect(
      matchesRules(
        unknown,
        rules([condition('type', 'movie'), condition('rating', '8', 'gte')], 'any'),
        [],
        defaults,
      ),
    ).toBe(true)
  })
  it('rejects incomplete, oversized and reversed conditions', () => {
    expect(validRules(rules([condition('rating', '', 'gte')]))).toBe(false)
    expect(validRules(rules([condition('year', '2026', 'between', '2020')]))).toBe(false)
    expect(validRules(rules(Array.from({ length: 9 }, () => condition('type', 'movie'))))).toBe(
      false,
    )
  })
  it('updates membership with viewing progress and preserves manual exceptions', () => {
    const r = rules([condition('status', 'planned')])
    const collection: Collection = {
      id: 'c',
      name: 'Watch next',
      items: [collectionKey(anime)],
      excluded: [collectionKey(unknown)],
      rules: r,
    }
    const history = [{ ...anime, videoId: 'a:1:1', position: 5, duration: 600, updatedAt: 1 }]
    expect(collectionMembers(collection, [anime, movie, unknown], [], history, defaults)).toEqual([
      anime,
      movie,
    ])
    collection.items = []
    expect(collectionMembers(collection, [anime, movie, unknown], [], history, defaults)).toEqual([
      movie,
    ])
  })
  it('uses multiple sort priorities, stable ties and missing values last', () => {
    const equal = { ...movie, id: 'd', name: 'Alpha', rating: 8 }
    expect(
      sortCollection(
        [unknown, anime, movie, equal],
        [
          { key: 'rating', direction: 'desc' },
          { key: 'name', direction: 'asc' },
        ],
        [unknown, anime, movie, equal],
        [],
        [],
        defaults,
      ).map((m) => m.id),
    ).toEqual(['d', 'a', 'b', 'c'])
    expect(
      sortCollection(
        [unknown, anime, movie],
        [{ key: 'year', direction: 'asc' }],
        [unknown, anime, movie],
        [],
        [],
        defaults,
      ).map((m) => m.id),
    ).toEqual(['b', 'a', 'c'])
  })
  it('keeps empty rating strings unknown rather than treating them as zero', () => {
    const missing = { ...unknown, imdbRating: ' ' }
    expect(matchesRules(missing, rules([condition('rating', '1', 'lte')]), [], defaults)).toBe(false)
    expect(matchesRules(missing, rules([condition('rating', '5', 'not')]), [], defaults)).toBe(false)
    expect(sortCollection([missing, movie], [{ key: 'rating', direction: 'asc' }], [missing, movie], [], [], defaults)).toEqual([movie, missing])
  })
  it('saves rules per profile and merges remote changes without resurrecting exclusions', () => {
    const state = createState()
    state.library = [anime, movie]
    state.collections = [
      {
        id: 'c',
        name: 'Smart',
        items: [],
        rules: rules([condition('type', 'anime')]),
        excluded: [collectionKey(anime)],
        sortRules: [{ key: 'rating', direction: 'desc' }],
      },
    ]
    state.profiles.push({ ...state.profiles[0], id: 'second', collections: [] })
    const baseline = syncSnapshot(state)
    expect(switchProfile(baseline, 'second').collections).toEqual([])
    expect(
      switchProfile(snapshotState(switchProfile(baseline, 'second')), 'main').collections,
    ).toEqual(state.collections)
    const local = structuredClone(baseline),
      remote = structuredClone(baseline)
    local.collections![0].excluded!.push(collectionKey(movie))
    remote.collections![0].name = 'Renamed'
    remote.profiles[0].collections = remote.collections
    const merged = mergeAccount(baseline, local, remote)
    expect(merged.collections![0]).toMatchObject({
      name: 'Renamed',
      excluded: [collectionKey(anime), collectionKey(movie)],
      rules: state.collections[0].rules,
    })
  })
})
