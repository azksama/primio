import type { Addon, Meta } from './types'
import { catalog, metadata } from './addons'
import { catalogTargets } from './catalog-pager'
import { matchesCategory } from './preferences'
import { canonicalGenre } from './genres'

export interface DiscoveryFilters {
  type?: string
  genre?: string
  from?: number
  to?: number
  rating?: number
  country?: string
  minutes?: number
}
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const genres: Record<string, string[]> = {
  'Science Fiction': ['science fiction', 'sci fi', 'sf'],
  Thriller: ['thriller'],
  Comedy: ['comedy', 'comedie', 'drole', 'funny'],
  Horror: ['horror', 'horreur'],
  Action: ['action'],
  Drama: ['drama', 'drame'],
  Romance: ['romance'],
  Fantasy: ['fantasy', 'fantastique'],
  Animation: ['animation'],
  Adventure: ['adventure', 'aventure'],
}
export const genreName = canonicalGenre
export function durationMinutes(runtime?: string): number | undefined {
  if (!runtime) return undefined
  const text = runtime.toLowerCase(),
    hours = text.match(/(\d+(?:[.,]\d+)?)\s*h/),
    minutes = text.match(/(\d+)\s*m/)
  const value = hours
    ? Number(hours[1].replace(',', '.')) * 60 + Number(minutes?.[1] ?? 0)
    : Number(minutes?.[1] ?? text.match(/^\d+(?:\.\d+)?$/)?.[0])
  return Number.isFinite(value) && value > 0 ? value : undefined
}
const countries: Record<string, string[]> = {
  JP: ['jp', 'japan', 'japon', 'japanese', 'japonais', 'japonaise'],
  KR: ['kr', 'korea', 'south korea', 'coree', 'coreen', 'korean'],
  CN: ['cn', 'china', 'chine', 'chinois', 'chinese'],
  US: ['us', 'usa', 'united states', 'americain'],
  FR: ['fr', 'france', 'francais', 'french'],
  GB: ['gb', 'uk', 'united kingdom', 'britannique'],
  DE: ['de', 'germany', 'allemagne'],
  ES: ['es', 'spain', 'espagne'],
}
export const countryCode = (s: string) =>
  Object.entries(countries).find(([, names]) => names.includes(normalize(s)))?.[0] ?? normalize(s)
export function matchesDiscovery(meta: Meta, f: DiscoveryFilters) {
  if (f.type && !matchesCategory(meta, f.type)) return false
  if (f.genre && !meta.genres?.some((g) => genreName(g) === genreName(f.genre!))) return false
  const year = Number(meta.releaseInfo?.match(/\d{4}/)?.[0]),
    rating = Number(meta.imdbRating),
    minutes = durationMinutes(meta.runtime)
  if ((f.from && (!year || year < f.from)) || (f.to && (!year || year > f.to))) return false
  if (f.rating && (!Number.isFinite(rating) || rating < f.rating)) return false
  if (f.minutes && (!minutes || minutes > f.minutes)) return false
  const origin = [
    ...(Array.isArray(meta.country) ? meta.country : [meta.country ?? '']),
    ...(meta.origin_country ?? []),
    ...(meta.production_countries ?? []).flatMap((c) => [c.iso_3166_1 ?? '', c.name ?? '']),
  ]
  return !f.country || origin.some((c) => countryCode(c) === countryCode(f.country!))
}
export function parseDiscoveryQuery(input: string): {
  query: string
  filters: DiscoveryFilters
  similar?: string
} {
  let query = normalize(input)
  const filters: DiscoveryFilters = {}
  const similar = query.match(/(?:similaire a|similar to|comme|like)\s+(.+)$/)?.[1]
  if (/\banimes?\b/.test(query)) filters.type = 'anime'
  else if (/\bseries?\b/.test(query)) filters.type = 'series'
  else if (/\bfilms?|movies?\b/.test(query)) filters.type = 'movie'
  for (const [genre, aliases] of Object.entries(genres))
    for (const alias of aliases)
      if (new RegExp(`\\b${alias}\\b`).test(query)) {
        filters.genre = genre
        query = query.replace(new RegExp(`\\b${alias}\\b`, 'g'), ' ')
      }
  for (const [code, names] of Object.entries(countries))
    for (const name of names.filter((n) => n.length > 2))
      if (new RegExp(`\\b${name}s?\\b`).test(query)) {
        filters.country = code
        query = query.replace(new RegExp(`\\b${name}s?\\b`, 'g'), ' ')
      }
  const decade = query.match(/(?:annees|years|the)\s+(\d{2}|\d{4})s?\b/)
  if (decade) {
    const n = Number(decade[1])
    filters.from = n < 100 ? (n >= 30 ? 1900 : 2000) + n : n
    filters.to = filters.from + 9
    query = query.replace(decade[0], ' ')
  }
  const duration = query.match(
    /(?:moins de|under|less than)\s+(\d+)\s*(heures?|hours?|h|min(?:utes?)?)/,
  )
  if (duration) {
    filters.minutes = Number(duration[1]) * (/^(h|heure|hour)/.test(duration[2]) ? 60 : 1) - 1
    query = query.replace(duration[0], ' ')
  }
  query = query
    .replace(/\b(films?|movies?|animes?|series|de|des|du|les|a|the|of|from)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { query: similar ?? query, filters, similar }
}
export function fuzzyScore(text: string, query: string) {
  const a = normalize(text),
    b = normalize(query)
  if (!b) return 1
  if (a === b) return 100
  if (a.startsWith(b)) return 90
  if (a.includes(b)) return 75
  const words = a.split(' ')
  return b.split(' ').every((q) =>
    words.some((w) => {
      if (w.startsWith(q)) return true
      if (Math.abs(w.length - q.length) > 2) return false
      let row = Array.from({ length: q.length + 1 }, (_, i) => i)
      for (let i = 1; i <= w.length; i++) {
        const next = [i]
        for (let j = 1; j <= q.length; j++)
          next[j] = Math.min(
            next[j - 1] + 1,
            row[j] + 1,
            row[j - 1] + Number(w[i - 1] !== q[j - 1]),
          )
        row = next
      }
      return row[q.length] <= (q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0)
    }),
  )
    ? 50
    : 0
}
export function affinity(candidate: Meta, seeds: Meta[], mood = 'similar') {
  let score = 0
  const reasons: string[] = []
  for (const seed of seeds) {
    const shared = (candidate.genres ?? []).filter((g) =>
      seed.genres?.some((s) => genreName(s) === genreName(g)),
    ).length
    score += shared * 2
    if (candidate.director?.some((d) => seed.director?.includes(d))) {
      score += 8
      reasons.push('Même réalisateur')
    }
    if (candidate.cast?.some((d) => seed.cast?.includes(d))) {
      score += 4
      reasons.push('Acteurs en commun')
    }
  }
  if (mood === 'director') score += reasons.includes('Même réalisateur') ? 12 : -100
  if (mood === 'cast') score += reasons.includes('Acteurs en commun') ? 12 : -100
  const gs = (candidate.genres ?? []).map(genreName)
  if (mood === 'darker')
    score += gs.some((g) => ['Horror', 'Thriller', 'Crime'].includes(g)) ? 10 : -4
  if (mood === 'funnier') score += gs.includes('Comedy') ? 10 : -4
  if (mood === 'shorter') {
    const duration = durationMinutes(candidate.runtime)
    score += duration ? Math.max(-5, 10 - duration / 15) : -5
  }
  return { score, reasons: [...new Set(reasons)] }
}
export async function discoveryPool(
  addons: Addon[],
  query = '',
  seeds: Meta[] = [],
  type?: string,
  choice = 'all',
  requireSuccess = false,
): Promise<Meta[]> {
  const types = type ? [type] : ['movie', 'series', 'anime']
  const targets = types.flatMap((kind) =>
    catalogTargets(addons, kind, choice, query, kind === 'anime', '').slice(0, 2),
  )
  const results = await Promise.allSettled(
    targets.map(async (target) =>
      (
        await catalog(
          target.addon,
          target.catalog.type,
          target.catalog.id,
          query ? { search: query } : undefined,
        )
      )
        .slice(0, 100)
        .map((m) => (target.anime ? { ...m, category: 'anime' as const } : m)),
    ),
  )
  const map = new Map(seeds.map((m) => [`${m.type}:${m.id}`, m]))
  if (requireSuccess && targets.length && results.every(r => r.status === 'rejected'))
    throw Error('Catalog providers unavailable')
  results.forEach((result) => {
    if (result.status === 'fulfilled')
      result.value.forEach((m) =>
        map.set(`${m.type}:${m.id}`, { ...map.get(`${m.type}:${m.id}`), ...m }),
      )
  })
  return [...map.values()]
}
export async function enrichDiscovery(addons: Addon[], pool: Meta[], limit = 36) {
  const enriched: Meta[] = []
  for (let i = 0; i < Math.min(pool.length, limit); i += 4) {
    const batch = await Promise.allSettled(pool.slice(i, i + 4).map((m) => metadata(addons, m)))
    batch.forEach((r, j) =>
      enriched.push(r.status === 'fulfilled' ? { ...pool[i + j], ...r.value } : pool[i + j]),
    )
  }
  return [...enriched, ...pool.slice(limit)]
}
