import { collectionKey } from './library-key'
import { isAnime } from './preferences'
import { viewingStatus } from './library-status'
import { countryCode, durationMinutes } from './discovery'
import type {
  Collection,
  CollectionCondition,
  CollectionRules,
  CollectionSort,
  Meta,
  Progress,
  Settings,
} from './types'

export const ruleLimits = { groups: 6, conditions: 8, sorts: 3 }
export const numericFields = new Set(['year', 'rating', 'runtime'])
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase()
export function validCondition(c: CollectionCondition) {
  if (!c.value.trim() || c.value.length > 120) return false
  if (numericFields.has(c.field)) {
    const n = Number(c.value),
      upper = Number(c.to)
    const max = c.field === 'rating' ? 10 : c.field === 'year' ? 3000 : 10000
    return (
      ['is', 'not', 'gte', 'lte', 'between'].includes(c.operator) &&
      Number.isFinite(n) &&
      n >= 0 &&
      n <= max &&
      (c.operator !== 'between' ||
        (!!c.to?.trim() && Number.isFinite(upper) && upper >= n && upper <= max))
    )
  }
  return (
    ['is', 'not', 'contains', 'not_contains'].includes(c.operator) &&
    (c.field !== 'type' || ['movie', 'series', 'anime'].includes(c.value)) &&
    (c.field !== 'status' || ['planned', 'watching', 'completed'].includes(c.value))
  )
}
export function validRules(rules: CollectionRules) {
  return (
    rules.version === 1 &&
    ['all', 'any'].includes(rules.match) &&
    rules.groups.length > 0 &&
    rules.groups.length <= ruleLimits.groups &&
    rules.groups.every(
      (g) =>
        ['all', 'any'].includes(g.match) &&
        g.conditions.length > 0 &&
        g.conditions.length <= ruleLimits.conditions &&
        g.conditions.every(validCondition),
    )
  )
}
export function needsCollectionMetadata(rules?: CollectionRules) {
  return (
    rules?.groups.some((g) =>
      g.conditions.some((c) => !['type', 'status', 'name'].includes(c.field)),
    ) ?? false
  )
}
export function numericValue(meta: Meta, field: string): number | undefined {
  const value =
    field === 'rating'
      ? Number(meta.rating ?? meta.imdbRating)
      : field === 'year'
        ? Number(meta.releaseInfo?.match(/\b\d{4}\b/)?.[0])
        : durationMinutes(meta.runtime)
  return Number.isFinite(value) ? value : undefined
}
function values(
  meta: Meta,
  c: CollectionCondition,
  progress: Progress[],
  settings: Settings,
): string[] | undefined {
  switch (c.field) {
    case 'type':
      return [isAnime(meta) ? 'anime' : meta.type]
    case 'status':
      return [viewingStatus(meta, progress, settings)]
    case 'name':
      return [meta.name]
    case 'genre':
      return meta.genres
    case 'cast':
      return meta.cast
    case 'director':
      return meta.director
    case 'language':
      return meta.originalLanguage || meta.original_language
        ? [meta.originalLanguage ?? meta.original_language!]
        : undefined
    case 'country':
      return [
        ...(typeof meta.country === 'string' ? meta.country.split(/,\s*/) : (meta.country ?? [])),
        ...(meta.origin_country ?? []),
        ...(meta.production_countries?.flatMap((c) =>
          [c.iso_3166_1, c.name].filter((v): v is string => !!v),
        ) ?? []),
      ]
    default:
      return undefined
  }
}
// Unknown metadata never satisfies a negative condition either.
function conditionMatches(
  meta: Meta,
  c: CollectionCondition,
  progress: Progress[],
  settings: Settings,
): boolean | undefined {
  if (!validCondition(c)) return false
  if (numericFields.has(c.field)) {
    const n = numericValue(meta, c.field),
      target = Number(c.value)
    if (n === undefined) return undefined
    return c.operator === 'gte'
      ? n >= target
      : c.operator === 'lte'
        ? n <= target
        : c.operator === 'between'
          ? n >= target && n <= Number(c.to)
          : c.operator === 'not'
            ? n !== target
            : n === target
  }
  const candidates = values(meta, c, progress, settings)
  if (!candidates?.length) return undefined
  const compare = c.field === 'country' ? countryCode : normalize
  const target = compare(c.value),
    contains = c.operator.includes('contains')
  const found = candidates.some((value) =>
    contains ? compare(value).includes(target) : compare(value) === target,
  )
  return c.operator === 'not' || c.operator === 'not_contains' ? !found : found
}
function combine(match: 'all' | 'any', results: (boolean | undefined)[]): boolean | undefined {
  if (match === 'all')
    return results.includes(false) ? false : results.includes(undefined) ? undefined : true
  return results.includes(true) ? true : results.includes(undefined) ? undefined : false
}
export function matchesRules(
  meta: Meta,
  rules: CollectionRules,
  progress: Progress[],
  settings: Settings,
) {
  if (!validRules(rules)) return false
  return (
    combine(
      rules.match,
      rules.groups.map((g) =>
        combine(
          g.match,
          g.conditions.map((c) => conditionMatches(meta, c, progress, settings)),
        ),
      ),
    ) === true
  )
}
export function matchesCollection(
  meta: Meta,
  collection: Collection,
  progress: Progress[],
  settings: Settings,
) {
  const key = collectionKey(meta)
  if (collection.excluded?.includes(key)) return false
  return (
    collection.items.includes(key) ||
    (!!collection.rules && matchesRules(meta, collection.rules, progress, settings))
  )
}
export function collectionMembers(
  collection: Collection,
  library: Meta[],
  metas: Meta[],
  progress: Progress[],
  settings: Settings,
) {
  const full = new Map(metas.map((m) => [collectionKey(m), m]))
  return library.filter((m) =>
    matchesCollection({ ...m, ...full.get(collectionKey(m)) }, collection, progress, settings),
  )
}
export function sortCollection(
  items: Meta[],
  sorts: CollectionSort[],
  library: Meta[],
  metas: Meta[],
  progress: Progress[],
  settings: Settings,
  manualOrder?: string[],
) {
  const full = new Map(metas.map((m) => [collectionKey(m), m]))
  const index = new Map(library.map((m, i) => [collectionKey(m), i]))
  const manualIndex = new Map((manualOrder ?? library.map(collectionKey)).map((key, i) => [key, i]))
  const order = { planned: 0, watching: 1, completed: 2 }
  return [...items].sort((a, b) => {
    for (const sort of sorts.slice(0, ruleLimits.sorts)) {
      const left = { ...a, ...full.get(collectionKey(a)) },
        right = { ...b, ...full.get(collectionKey(b)) }
      let value = 0
      if (sort.key === 'name')
        value = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      else if (sort.key === 'status')
        value =
          order[viewingStatus(left, progress, settings)] -
          order[viewingStatus(right, progress, settings)]
      else if (numericFields.has(sort.key)) {
        const x = numericValue(left, sort.key),
          y = numericValue(right, sort.key)
        // Missing values stay at the end in both directions.
        if (x === undefined || y === undefined) {
          if (x !== y) return x === undefined ? 1 : -1
        } else value = x - y
      } else value = (manualIndex.get(collectionKey(a)) ?? Number.MAX_SAFE_INTEGER) - (manualIndex.get(collectionKey(b)) ?? Number.MAX_SAFE_INTEGER)
      if (value) return sort.direction === 'desc' ? -value : value
    }
    return (index.get(collectionKey(a)) ?? 0) - (index.get(collectionKey(b)) ?? 0)
  })
}
