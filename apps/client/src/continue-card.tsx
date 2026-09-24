import { useEffect, useState } from 'react'
import { metadata } from './addons'
import { MediaImage } from './media-image'
import { episodeProgress } from './progress'
import { durationLabel } from './preferences'
import { t } from './i18n'
import type { Addon, Progress } from './types'
export function ContinueCard({
  item,
  addons,
  onPlay,
}: {
  item: Progress
  addons: Addon[]
  onPlay: () => void
}) {
  const [enrichment, setEnrichment] = useState<Partial<ReturnType<typeof episodeProgress>>>({})
  const episode = {
    ...enrichment,
    ...Object.fromEntries(
      Object.entries({
        episodeThumbnail: item.episodeThumbnail,
        episode: item.episode,
        season: item.season,
        seasonCount: item.seasonCount,
      }).filter(([, value]) => value !== undefined),
    ),
  }
  useEffect(() => {
    let active = true
    if (
      item.type !== 'movie' &&
      addons.length &&
      (!item.episodeThumbnail || item.seasonCount === undefined)
    )
      void metadata(addons, item)
        .then((meta) => {
          if (active) setEnrichment(episodeProgress(meta, item.videoId))
        })
        .catch(() => {})
    return () => {
      active = false
    }
  }, [item.id, item.videoId, item.episodeThumbnail, item.seasonCount, addons])
  return (
    <button className="continue-card" onClick={onPlay}>
      <MediaImage src={episode.episodeThumbnail || item.poster} />
      <strong>{item.name}</strong>
      {episode.episode != null && (
        <small className="continue-episode">
          {t('Épisode {n}', { n: episode.episode })}
          {(episode.seasonCount ?? 0) > 1 && ' • ' + t('Saison {n}', { n: episode.season ?? 1 })}
        </small>
      )}
      <progress max={item.duration || 1} value={item.position} />
      <small>
        {item.duration > item.position
          ? t('{time} restantes', { time: durationLabel(item.duration - item.position) })
          : t('Reprendre')}
      </small>
    </button>
  )
}
