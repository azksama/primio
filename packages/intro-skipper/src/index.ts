export interface SkipMedia {
  id: string
  type: string
  videos?: { id: string; season?: number; episode?: number }[]
}
export interface SkipPreferences {
  aniSkip: boolean
  skipIntro: boolean
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
  async function resolve(
    meta: SkipMedia,
    videoId: string,
    settings: SkipPreferences,
  ): Promise<SkipSegment[]> {
    const key = [meta.id, videoId, settings.aniSkip, settings.skipIntro].join('|'),
      cached = cache.get(key)
    if (cached && Date.now() - cached.at < 600000) return cached.segments
    const request = async () => {
      const video = meta.videos?.find((v) => v.id === videoId),
        parts = videoId.split(':')
      const episode = video?.episode ?? Number(parts.at(-1)),
        season = video?.season ?? (parts.length >= 3 ? Number(parts.at(-2)) : 1)
      if (settings.aniSkip && /^(kitsu|mal):\d+/.test(meta.id) && episode > 0) {
        let malId = meta.id.startsWith('mal:') ? meta.id.split(':')[1] : undefined
        if (!malId) {
          const mappings = await json<{
            data: { attributes: { externalSite: string; externalId: string } }[]
          }>(`https://kitsu.io/api/edge/anime/${meta.id.split(':')[1]}/mappings`)
          malId = mappings.data.find((m) => m.attributes.externalSite === 'myanimelist/anime')
            ?.attributes.externalId
        }
        if (malId && /^\d+$/.test(malId)) {
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
          return validSegments(
            (data.results ?? []).map((s) => ({
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
    const contributions = await Promise.allSettled([
      request(),
      ...providers.map((p) => p.resolve(meta, videoId, settings, json)),
    ])
    const segments = validSegments(
      contributions.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])),
    )
    if (cache.size > 200) cache.clear()
    cache.set(key, { at: Date.now(), segments })
    return segments
  }

  return { resolve, clearCache: () => cache.clear() }
}
