import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { catalog } from './addons'
import { catalogTargets } from './catalog-pager'
import { matchesCategory } from './preferences'
import type { Addon, Meta } from './types'

export const featuredDuration = 15_000

export function useFeaturedClock(count: number, active: boolean) {
  const [{ index, remaining, cycle }, setClock] = useState({ index: 0, remaining: featuredDuration, cycle: 0 })
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(() => !document.hidden)
  const running = active && visible && !paused && count > 1
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])
  useEffect(() => {
    if (!running) return
    let previous = performance.now()
    const timer = setInterval(() => {
      const now = performance.now(), elapsed = now - previous
      previous = now
      setClock(clock => clock.remaining > elapsed
        ? { ...clock, remaining: clock.remaining - elapsed }
        : { index: (clock.index + 1) % count, remaining: featuredDuration, cycle: clock.cycle + 1 })
    }, 100)
    return () => clearInterval(timer)
  }, [running, count])
  const setIndex = (value: number) => {
    setClock(clock => ({ index: ((value % Math.max(1, count)) + count) % Math.max(1, count), remaining: featuredDuration, cycle: clock.cycle + 1 }))
  }
  return { index, setIndex, paused, setPaused, remaining, running, cycle }
}

export function useFeaturedSwipe(index: number, count: number, select: (index: number) => void) {
  const gesture = useRef<{ id: number; x: number; y: number; horizontal: boolean } | null>(null)
  const cancel = () => { gesture.current = null }
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!e.isPrimary || gesture.current || e.button !== 0) { cancel(); return }
      if ((e.target as Element).closest('button,a,input')) return
      gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, horizontal: false }
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const g = gesture.current
      if (!g || g.id !== e.pointerId) return
      const dx = e.clientX - g.x, dy = e.clientY - g.y
      if (!g.horizontal && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { cancel(); return }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        g.horizontal = true
        e.currentTarget.setPointerCapture(e.pointerId)
      }
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const g = gesture.current
      cancel()
      if (g?.id === e.pointerId && g.horizontal && Math.abs(e.clientX - g.x) >= 56 && count > 1)
        select(index + (e.clientX < g.x ? 1 : -1))
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    },
    onPointerCancel: cancel,
    onLostPointerCapture: (e: PointerEvent<HTMLElement>) => {
      // Transferring implicit capture from a title to the hero also bubbles this event.
      if (e.target === e.currentTarget && gesture.current?.id === e.pointerId) cancel()
    },
  }
}

export function featuredSelection(items: Meta[], library: Meta[]) {
  return ['movie', 'series', 'anime'].flatMap((category) => {
    const genres = new Set(
      library.filter((m) => matchesCategory(m, category)).flatMap((m) => m.genres ?? []),
    )
    const candidates = items.filter((m) => matchesCategory(m, category))
    const score = (m: Meta) =>
      (library.some((x) => x.id === m.id && x.type === m.type) ? -100 : 0) +
      (m.genres ?? []).filter((g) => genres.has(g)).length
    const meta = candidates.sort((a, b) => score(b) - score(a))[0]
    return meta ? [{ category, meta }] : []
  })
}

export function useFeatured(
  addons: Addon[],
  movies: Meta[],
  library: Meta[],
  active: boolean,
  dismissed: string[] = [],
) {
  const [others, setOthers] = useState<Meta[]>([])
  useEffect(() => {
    let cancelled = false
    const targets = [
      ...catalogTargets(addons, 'series', 'all', '').slice(0, 2),
      ...catalogTargets(addons, 'series', 'all', '', true).slice(0, 2),
    ]
    void Promise.allSettled(
      targets.map(async (target) => {
        const items = await catalog(target.addon, target.catalog.type, target.catalog.id)
        return target.anime ? items.map((m) => ({ ...m, category: 'anime' as const })) : items
      }),
    ).then((results) => {
      if (!cancelled && results.some(r => r.status === 'fulfilled')) setOthers(results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])))
    })
    return () => {
      cancelled = true
    }
  }, [addons])
  const items = useMemo(
    () =>
      featuredSelection(
        [...movies, ...others].filter((m) => !dismissed.includes(m.type + ':' + m.id)),
        library,
      ),
    [movies, others, library, JSON.stringify(dismissed)],
  )
  const clock = useFeaturedClock(items.length, active)
  const current = items[clock.index % Math.max(1, items.length)]
  return { current, items, ...clock }
}
