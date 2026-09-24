import type { Meta } from './types'
export function correctAnimeDates(
  meta: Meta,
  dates: Map<number, string | null>,
): Meta {
  const videos = meta.videos ?? []
  const counts = new Map<string, number>()
  for (const v of videos) if (v.released) counts.set(v.released, (counts.get(v.released) ?? 0) + 1)
  return {
    ...meta,
    videos: videos.map((v) => {
      const premiere = videos.find(
        (first) => (first.season ?? 1) === (v.season ?? 1) && first.episode === 1,
      )
      const confirmed = dates.get(v.episode ?? 0)
      if (confirmed) return { ...v, released: confirmed, releaseUnconfirmed: false }
      // Kitsu's Stremio adapter falls back to the series premiere for undated episodes.
      const fallback =
        (v.episode ?? 1) > 1 &&
        !!v.released &&
        v.released === premiere?.released &&
        meta.id.startsWith('kitsu:') &&
        (counts.get(v.released) ?? 0) > 1
      const missing =
        !v.released ||
        v.releaseUnconfirmed ||
        fallback ||
        (dates.has(v.episode ?? 0) && !confirmed && (v.episode ?? 1) > 1)
      if (!missing) return v
      const start = premiere && Date.parse(dates.get(1) || premiere.released || '')
      const estimated =
        start != null && Number.isFinite(start) && v.episode && v.episode > 0
          ? new Date(start + (v.episode - 1) * 7 * 86400000).toISOString()
          : undefined
      return { ...v, released: estimated, releaseUnconfirmed: true }
    }),
  }
}
