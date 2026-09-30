import { withoutDeleted } from './progress-deletions'
import { failSavedSource } from './source-preferences'
import type { Meta, Progress, UserState } from './types'

export function episodeProgress(meta: Meta, videoId: string) {
  const video = meta.videos?.find((v) => v.id === videoId)
  return {
    episodeThumbnail: video?.thumbnail,
    episode: video?.episode,
    season: video?.season,
    seasonCount:
      meta.seasonCount ??
      (meta.videos
        ? new Set(meta.videos.filter((v) => (v.season ?? 1) > 0).map((v) => v.season ?? 1)).size
        : undefined),
  }
}

export const progressKey = (type: string, videoId: string) => JSON.stringify([type, videoId])
export const isWatched = (item?: Progress) =>
  !!item && (item.watched ?? (item.duration > 0 && item.position / item.duration >= 0.95))
export function findProgress(items: Progress[], type: string, videoId: string) {
  return items.find((item) => progressKey(item.type, item.videoId) === progressKey(type, videoId))
}
export function resumePosition(items: Progress[], type: string, videoId: string) {
  const item = findProgress(items, type, videoId)
  return item && item.duration > 0 && item.position < item.duration * 0.95 ? item.position : 0
}
export function recordProgress(
  items: Progress[],
  meta: Meta,
  videoId: string,
  position: number,
  duration: number,
  updatedAt = Date.now(),
  watched?: boolean,
): Progress[] {
  if (
    !Number.isFinite(position) ||
    !Number.isFinite(duration) ||
    !Number.isFinite(updatedAt) ||
    position < 0 ||
    duration <= 0
  )
    return items
  const previous = findProgress(items, meta.type, videoId)
  if (previous && previous.updatedAt >= updatedAt) return items
  const item: Progress = {
    id: meta.id,
    type: meta.type,
    name: meta.name,
    poster: meta.poster,
    category: meta.category,
    ...Object.fromEntries(
      Object.entries({
        episodeThumbnail: previous?.episodeThumbnail,
        episode: previous?.episode,
        season: previous?.season,
        seasonCount: previous?.seasonCount,
        ...Object.fromEntries(
          Object.entries(episodeProgress(meta, videoId)).filter(([, value]) => value !== undefined),
        ),
      }).filter(([, value]) => value !== undefined),
    ),
    videoId,
    position: Math.min(position, duration),
    duration,
    updatedAt,
    watched: watched ?? (isWatched(previous) ||
      (position / duration >= 0.95 && (!previous || previous.duration <= 0 ||
        previous.position / previous.duration < 0.95))),
  }
  return [
    item,
    ...items.filter((p) => progressKey(p.type, p.videoId) !== progressKey(meta.type, videoId)),
  ].slice(0, 500)
}
export interface NativeProgress {
  sourceFailed?: boolean
  watchedChanges?: { videoId: string; watched: boolean; updatedAt: number; season?: number; episode?: number }[]
  requestedVideoId?: string
  actionId?: string
  autoPlay?: boolean
  context: {
    trackPreferences?: {
      audio?: import('./types').TrackPreference
      subtitle?: import('./types').TrackPreference
    }
    accountId?: string
    profileId: string
    meta: Meta
    videoId: string
    sourceFingerprint?: string
  }
  position: number
  duration: number
  updatedAt: number
  closed?: boolean
}
export function mergeNativeProgress(state: UserState, event: NativeProgress): UserState {
  if (
    !event ||
    !Number.isFinite(event.position) ||
    !Number.isFinite(event.duration) ||
    event.position < 0 ||
    event.duration < 0
  )
    return state
  const c = event.context
  if (!c?.profileId || !c.meta?.id || !c.meta.type || !c.meta.name || !c.videoId) return state
  const profile = state.profiles.find((p) => p.id === c.profileId)
  if (
    !profile ||
    !Number.isFinite(event.updatedAt) ||
    (profile.lastPlaybackAt ?? 0) >= event.updatedAt
  )
    return state
  if (event.sourceFailed) {
    const update = (settings: import('./types').Settings) =>
      failSavedSource(settings, c.meta, c.videoId, c.sourceFingerprint, event.updatedAt)
    state = {
      ...state,
      settings: c.profileId === state.activeProfileId ? update(state.settings) : state.settings,
      profiles: state.profiles.map(p => p.id === c.profileId ? { ...p, settings: update(p.settings) } : p),
    }
  }
  if (event.watchedChanges?.length) {
    const apply = (items: Progress[], deleted: import('./progress-deletions').ProgressDeletion[] | undefined) => {
      let next = items
      for (const change of event.watchedChanges!.slice(-500)) {
        if (!change.videoId || typeof change.watched !== 'boolean' || !Number.isFinite(change.updatedAt) || change.updatedAt > event.updatedAt) continue
        const previous = findProgress(next, c.meta.type, change.videoId)
        const meta = { ...c.meta, videos: [{ id: change.videoId, title: '', season: change.season, episode: change.episode }] }
        next = recordProgress(next, meta, change.videoId, previous?.position ?? 0, previous?.duration || 1, change.updatedAt, change.watched)
      }
      return withoutDeleted(next, deleted)
    }
    state = {
      ...state,
      progress: c.profileId === state.activeProfileId ? apply(state.progress, state.deletedProgress) : state.progress,
      profiles: state.profiles.map(p => p.id === c.profileId ? { ...p, progress: apply(p.progress, p.deletedProgress) } : p),
    }
  }
  if (c.trackPreferences) {
    const prefs = Object.fromEntries(
      Object.entries(c.trackPreferences).map(([key, p]) => [
        key,
        { ...p, language: p?.language ?? '', title: p?.title ?? '' },
      ]),
    ) as NonNullable<typeof c.trackPreferences>
    const valid = [prefs.audio, prefs.subtitle]
      .filter(Boolean)
      .every(
        (p) =>
          p &&
          typeof p.language === 'string' &&
          p.language.length <= 20 &&
          typeof p.title === 'string' &&
          p.title.length <= 200 &&
          typeof p.forced === 'boolean',
      )
    if (valid) {
      const update = (settings: import('./types').Settings) => ({
        ...settings,
        trackPreferences: [
          ...(settings.trackPreferences ?? []).filter((p) => p.contentId !== c.meta.id),
          { contentId: c.meta.id, ...prefs },
        ].slice(-100),
      })
      state = {
        ...state,
        settings: c.profileId === state.activeProfileId ? update(state.settings) : state.settings,
        profiles: state.profiles.map((p) =>
          p.id === c.profileId ? { ...p, settings: update(p.settings) } : p,
        ),
      }
    }
  }
  const profiles = state.profiles.map((p) =>
    p.id === c.profileId ? { ...p, lastPlaybackAt: event.updatedAt } : p,
  )
  if (c.profileId === state.activeProfileId) {
    const progress = recordProgress(
      state.progress,
      c.meta,
      c.videoId,
      event.position,
      event.duration,
      event.updatedAt,
    )
    return { ...state, profiles, progress: withoutDeleted(progress, state.deletedProgress) }
  }
  return {
    ...state,
    profiles: profiles.map((p) =>
      p.id === c.profileId
        ? {
            ...p,
            progress: withoutDeleted(
              recordProgress(
                p.progress,
                c.meta,
                c.videoId,
                event.position,
                event.duration,
                event.updatedAt,
              ),
              p.deletedProgress,
            ),
          }
        : p,
    ),
  }
}
