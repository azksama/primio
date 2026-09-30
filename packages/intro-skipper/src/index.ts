export interface SkipMedia {
  id: string
  type: string
  name?: string
  category?: 'anime'
  releaseInfo?: string
  malId?: number | string
  idMal?: number
  videos?: { id: string; season?: number; episode?: number }[]
}
export interface SkipPreferences {
  aniSkip: boolean
  skipIntro: boolean
  skipRecaps?: boolean
}
export type JsonFetcher = <T>(url: string) => Promise<T>
export interface SkipProvider {
  id: string
  resolve: (
    media: SkipMedia,
    videoId: string,
    preferences: SkipPreferences,
    fetch: JsonFetcher,
  ) => Promise<SkipSegment[]>
}
export interface SkipSegment {
  start: number
  end: number
  label: string
  kind: 'intro' | 'outro' | 'recap'
  provider: string
  episodeLength?: number
}
export function validSegments(segments: SkipSegment[]): SkipSegment[] {
  return segments
    .filter(
      (s) =>
        Number.isFinite(s.start) &&
        Number.isFinite(s.end) &&
        s.start >= 0 &&
        s.end > s.start &&
        s.end <= 86400,
    )
    .sort((a, b) => a.start - b.start)
    .slice(0, 12)
}
export function createIntroSkipper(json: JsonFetcher, providers: SkipProvider[] = []) {
  const cache = new Map<string, { at: number; segments: SkipSegment[] }>()
  const pending = new Map<string, Promise<SkipSegment[]>>()
  const mappings = new Map<string, { at: number; promise: Promise<string | undefined> }>()
  const normalizeTitle = (title: string) => title.normalize('NFKC').toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  async function resolveMal(meta: SkipMedia, season: number): Promise<string | undefined> {
    const direct = meta.malId ?? meta.idMal ?? /^mal:(\d+)$/.exec(meta.id)?.[1]
    if (direct !== undefined && /^\d+$/.test(String(direct))) return String(direct)
    const kitsu = /^kitsu:(\d+)$/.exec(meta.id)?.[1]
    const anilist = /^anilist:(\d+)$/.exec(meta.id)?.[1]
    if (!kitsu && !anilist && (season > 1 || !meta.name || (meta.category !== 'anime' && meta.type !== 'anime'))) return
    const key = JSON.stringify([meta.id, meta.name, meta.releaseInfo, season])
    const saved = mappings.get(key)
    if (saved && Date.now() - saved.at < 600000) return saved.promise
    const promise = (async () => {
      let kitsuId = kitsu
      if (anilist) {
        const data = await json<{ data: { relationships: { item: { data: { id: string; type: string } } } }[] }>(
          `https://kitsu.io/api/edge/mappings?filter[externalSite]=anilist/anime&filter[externalId]=${anilist}`,
        )
        const ids = [...new Set(data.data.filter(m => m.relationships.item.data.type === 'anime')
          .map(m => m.relationships.item.data.id))]
        if (ids.length === 1) kitsuId = ids[0]
      } else if (!kitsuId && meta.name) {
        const data = await json<{ data: { id: string; attributes: {
          canonicalTitle: string; titles: Record<string, string | null>; abbreviatedTitles?: string[]; startDate?: string
        } }[] }>('https://kitsu.io/api/edge/anime?filter[text]=' + encodeURIComponent(meta.name) + '&page[limit]=20')
        const title = normalizeTitle(meta.name), year = /^\d{4}/.exec(meta.releaseInfo ?? '')?.[0]
        const matches = data.data.filter(m => (!year || m.attributes.startDate?.startsWith(year)) &&
          [m.attributes.canonicalTitle, ...Object.values(m.attributes.titles), ...(m.attributes.abbreviatedTitles ?? [])]
            .some(name => typeof name === 'string' && normalizeTitle(name) === title),
        )
        // Accept a unique exact canonical title or documented alias only.
        // A fuzzy first search result can skip unrelated scenes or seasons.
        if (matches.length === 1) kitsuId = matches[0].id
      }
      if (!kitsuId || !/^\d+$/.test(kitsuId)) return
      const data = await json<{ data: { attributes: { externalSite: string; externalId: string } }[] }>(
        `https://kitsu.io/api/edge/anime/${kitsuId}/mappings`,
      )
      return data.data.find(m => m.attributes.externalSite === 'myanimelist/anime' && /^\d+$/.test(m.attributes.externalId))?.attributes.externalId
    })().catch(() => undefined)
    if (mappings.size >= 200) mappings.clear()
    mappings.set(key, { at: Date.now(), promise })
    return promise
  }
  async function resolve(
    meta: SkipMedia,
    videoId: string,
    settings: SkipPreferences,
  ): Promise<SkipSegment[]> {
    const key = JSON.stringify([meta.id, meta.type, meta.name, meta.releaseInfo, meta.malId, meta.idMal,
      meta.videos?.find(v => v.id === videoId), videoId, settings.aniSkip, settings.skipIntro, settings.skipRecaps]),
      cached = cache.get(key)
    if (cached && Date.now() - cached.at < (cached.segments.length ? 600000 : 120000)) return cached.segments
    const running = pending.get(key)
    if (running) return running
    const request = async () => {
      const video = meta.videos?.find((v) => v.id === videoId),
        parts = videoId.split(':')
      const episode = video?.episode ?? Number(parts.at(-1)),
        season = video?.season ?? (parts.length >= 3 ? Number(parts.at(-2)) : 1)
      if (settings.aniSkip && episode > 0) {
        const malId = await resolveMal(meta, season)
        if (malId && /^\d+$/.test(malId)) {
          try {
            const data = await json<{
              found: boolean
              results?: {
                interval: { startTime: number; endTime: number }
                skipType: string
                episodeLength: number
              }[]
            }>(
              `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types[]=op&types[]=ed&types[]=recap&episodeLength=0`,
            )
            const segments = validSegments(
              (data.found === false ? [] : (data.results ?? []))
                .filter((s) => ['op', 'ed', 'recap'].includes(s.skipType))
                .map((s) => ({
                  start: s.interval.startTime,
                  end: s.interval.endTime,
                  kind: s.skipType === 'op' ? 'intro' : s.skipType === 'recap' ? 'recap' : 'outro',
                  label:
                    s.skipType === 'op'
                      ? 'Passer l’opening'
                      : s.skipType === 'recap'
                        ? 'Passer le récapitulatif'
                        : 'Passer l’ending',
                  provider: 'AniSkip',
                  episodeLength: s.episodeLength,
                })),
            )
            if (segments.length) return segments
          } catch { /* An unavailable AniSkip episode can still have IntroDB segments. */ }
        }
      }
      if (
        settings.skipIntro &&
        /^tt\d+$/.test(meta.id) &&
        (meta.type === 'movie' || (episode > 0 && season >= 0))
      ) {
        const params = new URLSearchParams({
          imdb_id: meta.id,
          ...(meta.type === 'movie'
            ? { is_movie: 'true' }
            : { season: String(season), episode: String(episode) }),
        })
        const data = await json<Record<string, { start_sec: number; end_sec: number } | null>>(
          'https://api.introdb.app/segments?' + params,
        )
        return validSegments(
          (['intro', 'recap', 'outro'] as const).flatMap((kind) =>
            data[kind]
              ? [
                  {
                    start: data[kind]!.start_sec,
                    end: data[kind]!.end_sec,
                    kind,
                    label:
                      kind === 'intro'
                        ? 'Passer l’intro'
                        : kind === 'recap'
                          ? 'Passer le récapitulatif'
                          : 'Passer le générique',
                    provider: 'IntroDB',
                  },
                ]
              : [],
          ),
        )
      }
      return []
    }
    const result = (async () => {
      const contributions = await Promise.allSettled([
        request(),
        ...providers.map((p) => p.resolve(meta, videoId, settings, json)),
      ])
      const segments = validSegments(
        contributions
          .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
          .filter((s) => settings.skipRecaps !== false || s.kind !== 'recap'),
      )
      if (cache.size > 200) cache.clear()
      cache.set(key, { at: Date.now(), segments })
      return segments
    })()
    pending.set(key, result)
    try { return await result } finally { pending.delete(key) }
  }

  return { resolve, clearCache: () => { cache.clear(); mappings.clear() } }
}
