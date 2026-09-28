import { metadataFetch } from './metadata-provider'
import type { Meta } from './types'

export interface DiscoveryCriteria {
  type?: string
  genre?: string
  from?: number
  to?: number
  rating?: number
  minutes?: number
  country?: string
  language?: string
  exclude?: string[]
}
export class DiscoveryError extends Error {
  constructor(public code: string, public status = 503) { super(code) }
}
const genres: Record<string, [number, number?]> = {
  Action: [28, 10759], Adventure: [12, 10759], Animation: [16, 16], Comedy: [35, 35],
  Crime: [80, 80], Documentary: [99, 99], Drama: [18, 18], Family: [10751, 10751],
  Fantasy: [14, 10765], Horror: [27], Mystery: [9648, 9648], Romance: [10749],
  'Science Fiction': [878, 10765], Thriller: [53],
}
export const discoveryGenres = Object.keys(genres)
// Credentials go directly to the metadata provider, never to Primio's backend.
export function discoveryService(token: string, fetcher: typeof fetch = metadataFetch, pick = (max: number) => Math.floor(Math.random() * max)) {
  const cache = new Map<string, { until: number; data: any }>()
  const flights = new Map<string, Promise<any>>()
  async function request(url: string, init?: RequestInit) {
    const key = url + (init?.body ?? '')
    const saved = cache.get(key)
    if (saved && saved.until > Date.now()) return saved.data
    if (flights.has(key)) return flights.get(key)
    const work = (async () => {
      const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(3000), redirect: 'error' })
      if (!response.ok) throw new DiscoveryError(response.status === 401 || response.status === 403 ? 'TMDB_INVALID_TOKEN' : response.status === 429 ? 'PROVIDER_BUSY' : 'PROVIDER_UNAVAILABLE')
      const body = await response.text()
      if (body.length > 2_000_000) throw new DiscoveryError('INVALID_METADATA')
      const data = JSON.parse(body)
      if (data.errors) throw new DiscoveryError('PROVIDER_UNAVAILABLE')
      cache.set(key, { until: Date.now() + 300_000, data })
      while (cache.size > 200) cache.delete(cache.keys().next().value!)
      return data
    })().finally(() => flights.delete(key))
    flights.set(key, work)
    return work
  }
  const tmdb = (path: string, params: Record<string, string> = {}) => {
    if (!token) throw new DiscoveryError('TMDB_NOT_CONFIGURED')
    return request('https://api.themoviedb.org/3/' + path + '?' + new URLSearchParams(params), {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    })
  }
  async function movies(f: DiscoveryCriteria, type: 'movie' | 'series') {
    const kind = type === 'movie' ? 'movie' : 'tv'
    const date = kind === 'movie' ? 'primary_release_date' : 'first_air_date'
    const params: Record<string, string> = {
      include_adult: 'false', sort_by: 'popularity.desc', 'vote_count.gte': '20',
      language: f.language ?? 'en', page: '1',
      [`${date}.lte`]: f.to ? `${f.to}-12-31` : new Date().toISOString().slice(0, 10),
    }
    if (f.from) params[`${date}.gte`] = `${f.from}-01-01`
    if (f.rating) params['vote_average.gte'] = String(f.rating)
    if (f.minutes) { params['with_runtime.lte'] = String(f.minutes); params['with_runtime.gte'] = '1' }
    if (f.country) params.with_origin_country = f.country
    if (f.genre) {
      const genre = genres[f.genre]?.[kind === 'movie' ? 0 : 1]
      if (!genre) return null
      params.with_genres = String(genre)
    }
    const first = await tmdb(`discover/${kind}`, params)
    if (!first.total_pages) return null
    const page = 1 + pick(Math.min(100, first.total_pages))
    const pool = page === 1 ? first : await tmdb(`discover/${kind}`, { ...params, page: String(page) })
    const candidates = [...(pool.results ?? [])]
    for (let attempts = 0; candidates.length && attempts < 2; attempts++) {
      const candidate = candidates.splice(pick(candidates.length), 1)[0]
      const m = await tmdb(`${kind}/${candidate.id}`, { language: f.language ?? 'en', append_to_response: 'external_ids,credits,videos,images', include_image_language: `${f.language ?? 'en'},en,null` })
      const id = m.imdb_id || m.external_ids?.imdb_id || `tmdb:${m.id}`
      const anime = (m.genres ?? []).some((g: any) => g.id === 16) && (m.origin_country ?? [m.original_language?.toUpperCase()]).some((c: string) => ['JP','KR','CN','JA','KO','ZH'].includes(c))
      if (m.adult || (type === 'series' && anime) || f.exclude?.includes(id)) continue
      const runtime = m.runtime || m.episode_run_time?.[0] || m.last_episode_to_air?.runtime
      if (f.minutes && (!runtime || runtime > f.minutes)) continue
      return {
        id, type, name: m.title || m.name, logo: m.images?.logos?.[0]?.file_path ? `https://image.tmdb.org/t/p/w500${m.images.logos[0].file_path}` : undefined, poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
        background: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : undefined,
        description: m.overview, releaseInfo: (m.release_date || m.first_air_date || '').slice(0, 4),
        runtime: runtime ? `${runtime} min` : undefined, rating: m.vote_average, ratingSource: 'TMDB',
        genres: m.genres?.map((g: any) => g.name), country: m.origin_country ?? m.production_countries?.map((c: any) => c.iso_3166_1),
        originalLanguage: m.original_language, cast: m.credits?.cast?.slice(0, 12).map((c: any) => c.name),
        director: m.credits?.crew?.filter((c: any) => c.job === 'Director').map((c: any) => c.name),
        trailers: m.videos?.results?.filter((v: any) => v.site === 'YouTube' && v.type === 'Trailer').slice(0, 2).map((v: any) => ({ ytId: v.key })),
      }
    }
    return null
  }
  async function anime(f: DiscoveryCriteria) {
    const query = `query PrimioRandom($page:Int,$genre:[String],$score:Int,$duration:Int,$country:CountryCode,$from:FuzzyDateInt,$to:FuzzyDateInt) {
      Page(page:$page,perPage:30) { pageInfo { lastPage } media(type:ANIME,isAdult:false,status_not:NOT_YET_RELEASED,genre_in:$genre,averageScore_greater:$score,duration_lesser:$duration,countryOfOrigin:$country,startDate_greater:$from,startDate_lesser:$to,sort:POPULARITY_DESC) {
        id idMal format title { english romaji } description(asHtml:false) coverImage { large } bannerImage
        averageScore genres duration startDate { year } countryOfOrigin trailer { id site }
      } }
    }`
    const variables = { page: 1, genre: f.genre ? [f.genre === 'Science Fiction' ? 'Sci-Fi' : f.genre] : undefined,
      score: f.rating === undefined ? undefined : Math.ceil(f.rating * 10) - 1, duration: f.minutes ? f.minutes + 1 : undefined,
      country: f.country, from: f.from ? f.from * 10000 : undefined, to: f.to ? (f.to + 1) * 10000 : undefined }
    const get = (page: number) => request('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables: { ...variables, page } }) })
    const first = (await get(1)).data?.Page
    if (!first?.media?.length) return null
    const page = 1 + pick(Math.max(1, Math.min(50, first.pageInfo.lastPage || 1)))
    const data = page === 1 ? first : (await get(page)).data?.Page
    const candidates = (data?.media ?? []).filter((m: any) => !f.exclude?.includes(m.idMal ? `mal:${m.idMal}` : `anilist:${m.id}`))
    if (!candidates.length) return null
    const m = candidates[pick(candidates.length)]
    return { id: m.idMal ? `mal:${m.idMal}` : `anilist:${m.id}`, type: m.format === 'MOVIE' ? 'movie' : 'series', category: 'anime' as const,
      name: m.title.english || m.title.romaji, poster: m.coverImage?.large, background: m.bannerImage,
      description: m.description?.replace(/<[^>]*>/g, ''), releaseInfo: String(m.startDate.year || ''),
      runtime: m.duration ? `${m.duration} min` : undefined, genres: m.genres, country: m.countryOfOrigin,
      rating: m.averageScore ? m.averageScore / 10 : undefined, ratingSource: 'AniList',
      trailers: m.trailer?.site === 'youtube' ? [{ ytId: m.trailer.id }] : [],
    }
  }
  return async (filters: DiscoveryCriteria): Promise<{ item: Meta | null; provider: string }> => {
    const types = filters.type ? [filters.type] : (['movie', 'series', 'anime'] as const).filter(type => (token || type === 'anime') && (!filters.genre || type !== 'series' || genres[filters.genre]?.[1]))
    const type = types[pick(types.length)]
    const item = type === 'anime' ? await anime(filters) : await movies(filters, type === 'series' ? 'series' : 'movie')
    return { item, provider: type === 'anime' ? 'AniList' : 'TMDB' }
  }
}
