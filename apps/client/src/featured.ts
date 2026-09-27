import { useEffect, useMemo, useState } from 'react'
import { catalog } from './addons'
import { catalogTargets } from './catalog-pager'
import { matchesCategory } from './preferences'
import type { Addon, Meta } from './types'

export function featuredSelection(items: Meta[], library: Meta[]) {
  return ['movie', 'series', 'anime'].flatMap((category) => {
    const genres = new Set(library.filter((m) => matchesCategory(m, category)).flatMap((m) => m.genres ?? []))
    const candidates = items.filter((m) => matchesCategory(m, category))
    const score = (m: Meta) => (library.some((x) => x.id === m.id && x.type === m.type) ? -100 : 0) + (m.genres ?? []).filter((g) => genres.has(g)).length
    const meta = candidates.sort((a, b) => score(b) - score(a))[0]
    return meta ? [{ category, meta }] : []
  })
}

export function useFeatured(addons: Addon[], movies: Meta[], library: Meta[], active: boolean) {
  const [others, setOthers] = useState<Meta[]>([])
  const [index, setIndex] = useState(0), [paused, setPaused] = useState(false), [interacting, setInteracting] = useState(false)
  useEffect(() => {
    let cancelled = false
    setOthers([])
    const targets = [...catalogTargets(addons, 'series', 'all', '').slice(0, 2), ...catalogTargets(addons, 'series', 'all', '', true).slice(0, 2)]
    void Promise.allSettled(targets.map(async (target) => {
      const items = await catalog(target.addon, target.catalog.type, target.catalog.id)
      return target.anime ? items.map((m) => ({ ...m, category: 'anime' as const })) : items
    })).then((results) => { if (!cancelled) setOthers(results.flatMap((r) => r.status === 'fulfilled' ? r.value : [])) })
    return () => { cancelled = true }
  }, [addons])
  const items = useMemo(() => featuredSelection([...movies, ...others], library), [movies, others, library])
  const current = items[index % Math.max(1, items.length)]
  useEffect(() => {
    if (!active || paused || interacting || items.length < 2) return
    let timer: ReturnType<typeof setInterval> | undefined
    const resume = () => {
      clearInterval(timer)
      if (!document.hidden) timer = setInterval(() => setIndex((i) => (i + 1) % items.length), 15_000)
    }
    resume(); document.addEventListener('visibilitychange', resume)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', resume) }
  }, [active, paused, interacting, items.length])
  return { current, items, setIndex, paused, setPaused, setInteracting }
}
