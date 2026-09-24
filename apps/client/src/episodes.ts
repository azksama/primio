import { t } from './i18n'
import type { Meta } from './types'
export function episodeQueue(meta: Meta, currentId: string, now = Date.now()) {
  const episodes = (meta.type === 'movie' ? [] : (meta.videos ?? []))
    .slice()
    .sort((a, b) => (a.season ?? 1) - (b.season ?? 1) || (a.episode ?? 0) - (b.episode ?? 0))
  const index = episodes.findIndex((v) => v.id === currentId)
  const current = episodes[index]
  const next =
    index >= 0
      ? episodes
          .slice(index + 1)
          .find(
            (v) =>
              (v.season ?? 1) > 0 &&
              !v.releaseUnconfirmed &&
              (!v.released ||
                !Number.isFinite(Date.parse(v.released)) ||
                Date.parse(v.released) <= now),
          )
      : undefined
  return {
    episodes: episodes.map((v) => ({
      id: v.id,
      title: v.title || v.name || t('Épisode'),
      season: v.season ?? 1,
      episode: v.episode ?? 0,
    })),
    nextVideoId: current && next ? next.id : '',
    currentVideoId: currentId,
    logo: meta.logo ?? '',
  }
}

export function playbackTitle(meta: Meta, id: string) {
  const video = meta.videos?.find((v) => v.id === id)
  if (meta.type === 'movie' || !video?.episode) return meta.name
  const multiple = new Set(meta.videos?.map((v) => v.season ?? 1).filter((s) => s > 0)).size > 1
  return (
    meta.name +
    ' - ' +
    t('Épisode {n}', { n: video.episode }) +
    (multiple ? ' (' + t('Saison {n}', { n: video.season ?? 1 }) + ')' : '')
  )
}
