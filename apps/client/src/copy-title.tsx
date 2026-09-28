import { useEffect, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { t } from './i18n'
export function CopyTitle({
  title,
  onCopied,
  onError,
}: {
  title: string
  onCopied: () => void
  onError: (e: unknown) => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const heading = useRef<HTMLHeadingElement>(null)
  const start = useRef({ x: 0, y: 0 })
  const cancel = () => clearTimeout(timer.current)
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    const el = heading.current
    if (!el) return
    let width = -1
    const fit = () => {
      if (!el.clientWidth) return
      width = el.clientWidth
      let size = width >= 600 ? 64 : 48
      el.style.fontSize = `${size}px`
      // Prefer two lines; very long names wrap at the readable minimum.
      while (size > 24 && el.scrollHeight > size * 1.12 * 2 + 2) {
        el.style.fontSize = `${--size}px`
      }
    }
    const observer = new ResizeObserver(() => { if (width !== el.clientWidth) fit() })
    observer.observe(el)
    fit()
    let active = true
    void document.fonts.ready.then(() => { if (active) fit() })
    return () => { active = false; observer.disconnect() }
  }, [title])
  const copy = async () => {
    cancel()
    try {
      if (isTauri()) await invoke('copy_text', { text: title })
      else await navigator.clipboard.writeText(title)
      onCopied()
    } catch (e) {
      onError(e)
    }
  }
  return (
    <h1
      ref={heading}
      className="serif copy-title"
      tabIndex={0}
      aria-label={title + ' · ' + t('Copier le titre')}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY }
        timer.current = setTimeout(copy, 600)
      }}
      onPointerMove={(e) => {
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel()
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => {
        e.preventDefault()
        void copy()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void copy()
      }}
    >
      {title}
    </h1>
  )
}

export function ContentLogo({ src, title }: { src?: string; title: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (!src || failed) return null
  return <img className="detail-logo" src={src} alt={title} onError={() => setFailed(true)} />
}
