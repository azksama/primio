import { useEffect } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
export function useTvMode(mode = 'auto') {
  useEffect(() => {
    let live = true
    const apply = (native: boolean) => {
      if (live)
        document.documentElement.classList.toggle(
          'tv-mode',
          mode === 'on' || (mode === 'auto' && native),
        )
    }
    if (isTauri())
      void invoke<boolean>('tv_device')
        .then(apply)
        .catch(() => apply(false))
    else apply(false)
    return () => {
      live = false
      document.documentElement.classList.remove('tv-mode')
    }
  }, [mode])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !document.documentElement.classList.contains('tv-mode') ||
        e.altKey ||
        e.ctrlKey ||
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
      )
        return
      if ((e.target as HTMLElement)?.matches('input,textarea,select,[role=slider]')) return
      const scope = document.querySelector('dialog[open]') ?? document
      const candidates = [
        ...scope.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,select,[tabindex="0"]',
        ),
      ].filter(
        (n) =>
          n.getClientRects().length &&
          getComputedStyle(n).visibility !== 'hidden' &&
          !n.closest('[inert]'),
      )
      const active = document.activeElement as HTMLElement,
        rect = active?.getBoundingClientRect()
      if (!rect || !candidates.includes(active)) {
        candidates[0]?.focus()
        e.preventDefault()
        return
      }
      const x = rect.x + rect.width / 2,
        y = rect.y + rect.height / 2,
        horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight',
        sign = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1
      const best = candidates
        .filter((n) => n !== active)
        .map((n) => {
          const r = n.getBoundingClientRect(),
            dx = r.x + r.width / 2 - x,
            dy = r.y + r.height / 2 - y,
            forward = (horizontal ? dx : dy) * sign,
            cross = Math.abs(horizontal ? dy : dx)
          return { n, forward, score: forward + cross * 3 }
        })
        .filter((n) => n.forward > 4)
        .sort((a, b) => a.score - b.score)[0]
      if (best) {
        best.n.focus()
        best.n.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
}
