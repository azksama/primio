import { useEffect, useState } from 'react'
import { metadata } from './addons'
import { compareEpisodes, isEpisodeAvailable } from './episode-order'
import { episodeProgress, findProgress, isWatched } from './progress'
import type { Addon, Meta, Progress } from './types'

export interface ContinueItem extends Progress {
  meta?: Meta
  nextEpisode?: boolean
}

export function continueWatching(progress: Progress[], metas: Meta[], now = Date.now()): ContinueItem[] {
  const groups = new Map<string, Progress[]>()
  for (const item of [...progress].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (item.position <= 0 && !isWatched(item)) continue
    const key = JSON.stringify([item.type, item.id])
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.values()].flatMap(items => {
    const latest = items[0]
    const meta = metas.find(m => m.id === latest.id && m.type === latest.type)
    if (!isWatched(latest)) return [{ ...latest, meta }]
    if (latest.type === 'movie' || !meta?.videos?.length) return []
    const current = meta.videos.find(v => v.id === latest.videoId) ?? latest
    if (current.episode === undefined) return []
    const next = [...meta.videos].sort(compareEpisodes).find(v =>
      compareEpisodes(v, current) > 0 && isEpisodeAvailable(v, now) &&
      !isWatched(findProgress(progress, meta.type, v.id)),
    )
    if (!next) return []
    const saved = findProgress(progress, meta.type, next.id)
    return [{
      ...latest, ...episodeProgress(meta, next.id), ...saved,
      videoId: next.id, watched: false, position: saved?.position ?? 0, duration: saved?.duration ?? 0,
      updatedAt: latest.updatedAt, meta, nextEpisode: !saved?.position,
    }]
  }).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function useContinueWatching(progress: Progress[], addons: Addon[], scope: string, ready: boolean) {
  const [catalog, setCatalog] = useState<{ key: string; metas: Meta[] }>({ key: '', metas: [] })
  const [now, setNow] = useState(Date.now())
  const titles = [...new Map(progress.filter(p => p.type !== 'movie' && (p.position > 0 || isWatched(p)))
    .map(p => [JSON.stringify([p.type, p.id]), p])).values()]
  const signature = JSON.stringify([scope, titles.map(p => [p.type, p.id]).sort(), addons.map(a => [a.url, a.enabled])])
  // Recheck while open, on return to the app, and after restart. A future episode
  // is derived from metadata, never written as fabricated playback progress.
  useEffect(() => {
    const update = () => setNow(Date.now())
    const timer = setInterval(update, 60000)
    window.addEventListener('focus', update)
    window.addEventListener('online', update)
    return () => { clearInterval(timer); window.removeEventListener('focus', update); window.removeEventListener('online', update) }
  }, [])
  const refresh = Math.floor(now / 300000)
  useEffect(() => {
    if (!ready) return
    let active = true
    const queue = [...titles], metas: Meta[] = []
    const work = async () => {
      while (active && queue.length) {
        const title = queue.shift()!
        try {
          const meta = await metadata(addons, title)
          if (!active) return
          metas.push(meta)
          setCatalog(previous => ({ key: signature, metas: previous.key === signature
            ? [...previous.metas.filter(m => m.id !== meta.id || m.type !== meta.type), meta]
            : [...metas] }))
        } catch { /* Preserve resumable history when a provider is offline. */ }
      }
    }
    void Promise.all(Array.from({ length: Math.min(3, queue.length) }, work))
    return () => { active = false }
  }, [signature, ready, refresh])
  return continueWatching(progress, catalog.key === signature ? catalog.metas : [], now)
}
