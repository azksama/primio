import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { mergeDeletions, withoutDeleted, type ProgressDeletion } from './progress-deletions'
import { api } from './platform'
import { snapshotState } from './preferences'
import { progressKey } from './progress'
import type { Progress, UserState } from './types'

export function mergePlayback(local: Progress[], remote: Progress[]) {
  const items = new Map<string, Progress>()
  for (const item of [...local, ...remote]) {
    const key = progressKey(item.type, item.videoId),
      previous = items.get(key)
    if (!previous || item.updatedAt > previous.updatedAt) items.set(key, item)
  }
  return [...items.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 500)
}

export function mergePlaybackState(
  state: UserState,
  remote: { id: string; progress: Progress[]; deletedProgress?: ProgressDeletion[] }[],
) {
  const snapshot = snapshotState(state)
  const profiles = snapshot.profiles.map((p) => {
    const other = remote.find((r) => r.id === p.id)
    const deletedProgress = mergeDeletions(p.deletedProgress, other?.deletedProgress)
    return {
      ...p,
      deletedProgress,
      progress: withoutDeleted(mergePlayback(p.progress, other?.progress ?? []), deletedProgress),
    }
  })
  return {
    ...state,
    profiles,
    deletedProgress:
      profiles.find((p) => p.id === state.activeProfileId)?.deletedProgress ??
      state.deletedProgress,
    progress: profiles.find((p) => p.id === state.activeProfileId)?.progress ?? state.progress,
  }
}

export function usePlaybackSync(
  state: UserState,
  setState: Dispatch<SetStateAction<UserState>>,
  token: string,
  ready: boolean,
) {
  const current = useRef(state)
  current.current = state
  useEffect(() => {
    if (!token || !ready) return
    let active = true,
      busy = false
    const sync = async () => {
      if (busy || !navigator.onLine) return
      busy = true
      try {
        const local = snapshotState(current.current)
        const result = await api<{
          profiles: { id: string; progress: Progress[]; deletedProgress?: ProgressDeletion[] }[]
        }>(
          '/account/progress',
          'POST',
          {
            profiles: local.profiles.map((p) => ({
              id: p.id,
              progress: p.progress,
              deletedProgress: p.deletedProgress,
            })),
          },
          token,
        )
        if (!active) return
        setState((s) => {
          const snapshot = snapshotState(s)
          const next = mergePlaybackState(s, result.profiles)
          return JSON.stringify(snapshot) === JSON.stringify(next) ? s : next
        })
      } catch {
        /* Offline progress remains persisted locally and is retried on reconnect. */
      } finally {
        busy = false
      }
    }
    void sync()
    const timer = setInterval(sync, 10000)
    window.addEventListener('focus', sync)
    window.addEventListener('online', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('focus', sync)
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [token, ready])
}
