import { t } from './i18n'
import { findProgress, isWatched, viewingFraction } from './progress'
import { compareEpisodes, isEpisodeAvailable } from './episode-order'
import { cleanDescription } from './content'
import type { Meta, Progress } from './types'
export function episodeQueue(
  meta: Meta,
  currentId: string,
  now = Date.now(),
  hideSpoilers = false,
  progress: Progress[] = [],
) {
  const episodes = (meta.type === 'movie' ? [] : (meta.videos ?? []))
    .slice()
    .sort(compareEpisodes)
  const index = episodes.findIndex((v) => v.id === currentId)
  const current = episodes[index]
  const next =
    index >= 0
      ? episodes
          .slice(index + 1)
          .find((v) => isEpisodeAvailable(v, now))
      : undefined
  return {
    episodes: episodes.map((v) => ({
      id: v.id,
      title:
        hideSpoilers && !isWatched(findProgress(progress, meta.type, v.id))
          ? t('Épisode {n}', { n: v.episode ?? 0 })
          : v.title || v.name || t('Épisode'),
      thumbnail: hideSpoilers && !isWatched(findProgress(progress, meta.type, v.id))
        ? meta.poster ?? '' : v.thumbnail ?? meta.poster ?? '',
      description: hideSpoilers && !isWatched(findProgress(progress, meta.type, v.id))
        ? '' : cleanDescription(v.overview || v.description || ''),
      season: v.season ?? 1,
      episode: v.episode ?? 0,
      watched: isWatched(findProgress(progress, meta.type, v.id)),
      progress: viewingFraction(findProgress(progress, meta.type, v.id)),
      position: findProgress(progress, meta.type, v.id)?.position ?? 0,
      duration: findProgress(progress, meta.type, v.id)?.duration ?? 0,
      current: v.id === currentId,
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

export function watchVideoId(meta: Meta, progress: Progress[], now = Date.now()) {
  if (meta.type === 'movie' || (meta.type !== 'series' && meta.type !== 'anime' && !meta.videos?.length)) return meta.id
  const videos = [...(meta.videos ?? [])].sort(compareEpisodes)
  const latest = progress.filter(p => p.id === meta.id && p.type === meta.type &&
    p.videoId !== meta.id && (p.position > 0 || isWatched(p)),
  ).sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (latest) {
    if (!isWatched(latest)) return latest.videoId
    const index = videos.findIndex(v => v.id === latest.videoId)
    const following = index >= 0 ? videos.slice(index + 1) : videos.filter(v =>
      latest.season !== undefined && latest.episode !== undefined &&
      ((v.season ?? 1) > latest.season || ((v.season ?? 1) === latest.season && (v.episode ?? 0) > latest.episode)),
    )
    const next = following.find(v => isEpisodeAvailable(v, now) && !isWatched(findProgress(progress, meta.type, v.id)))
    if (next) return next.id
    return latest.videoId
  }
  if (!videos.length) return undefined
  return videos.find(v => isEpisodeAvailable(v, now) && !isWatched(findProgress(progress, meta.type, v.id)))?.id
}
