import { useEffect, useRef } from 'react'
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
  const start = useRef({ x: 0, y: 0 })
  const cancel = () => clearTimeout(timer.current)
  useEffect(() => () => clearTimeout(timer.current), [])
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
