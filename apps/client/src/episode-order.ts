import type { Meta } from './types'

type Episode = NonNullable<Meta['videos']>[number]

export function compareEpisodes(a: Pick<Episode, 'season' | 'episode'>, b: Pick<Episode, 'season' | 'episode'>) {
  return (a.season ?? 1) - (b.season ?? 1) || (a.episode ?? 0) - (b.episode ?? 0)
}

export function isEpisodeAvailable(video: Episode, now = Date.now()) {
  const released = Date.parse(video.released ?? '')
  return (video.season ?? 1) > 0 && !video.releaseUnconfirmed &&
    (!video.released || (Number.isFinite(released) && released <= now))
}
