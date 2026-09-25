import type { Progress, UserState } from './types'
import { progressKey } from './progress'

export interface ProgressDeletion {
  type: string
  videoId: string
  updatedAt: number
}
export function mergeDeletions(...lists: (ProgressDeletion[] | undefined)[]) {
  const entries = new Map<string, ProgressDeletion>()
  for (const item of lists.flatMap((list) => list ?? [])) {
    const key = progressKey(item.type, item.videoId)
    if (item.updatedAt > (entries.get(key)?.updatedAt ?? -1)) entries.set(key, item)
  }
  return [...entries.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2000)
}
export function withoutDeleted(items: Progress[], deletions: ProgressDeletion[] = []) {
  const deleted = new Map(deletions.map((d) => [progressKey(d.type, d.videoId), d.updatedAt]))
  return items.filter((p) => p.updatedAt > (deleted.get(progressKey(p.type, p.videoId)) ?? -1))
}
export function removeProgress(state: UserState, item: Progress, now = Date.now()): UserState {
  const deletedProgress = mergeDeletions(state.deletedProgress, [
    { type: item.type, videoId: item.videoId, updatedAt: Math.max(now, item.updatedAt) },
  ])
  return { ...state, deletedProgress, progress: withoutDeleted(state.progress, deletedProgress) }
}
