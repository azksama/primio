import type { Meta, Progress, UserState } from './types'

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
    videoId,
    position: Math.min(position, duration),
    duration,
    updatedAt,
    watched: watched ?? (isWatched(previous) || position / duration >= 0.95),
  }
  return [
    item,
    ...items.filter((p) => progressKey(p.type, p.videoId) !== progressKey(meta.type, videoId)),
  ].slice(0, 500)
}
export interface NativeProgress {
  requestedVideoId?: string
  actionId?: string
  autoPlay?: boolean
  context: { accountId?: string; profileId: string; meta: Meta; videoId: string }
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
    event.duration <= 0
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
    return { ...state, profiles, progress }
  }
  return {
    ...state,
    profiles: profiles.map((p) =>
      p.id === c.profileId
        ? {
            ...p,
            progress: recordProgress(
              p.progress,
              c.meta,
              c.videoId,
              event.position,
              event.duration,
              event.updatedAt,
            ),
          }
        : p,
    ),
  }
}
