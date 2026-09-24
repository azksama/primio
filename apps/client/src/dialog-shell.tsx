import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { isDesktop } from './platform'

let desktopDialogs = 0

export function DialogShell({
  children,
  title,
  onClose,
}: {
  children: ReactNode
  title: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!isDesktop()) {
      dialog.showModal()
      return () => dialog.close()
    }
    const previous = document.activeElement
    const workspace = document.querySelector<HTMLElement>('.desktop-workspace')
    desktopDialogs++
    if (workspace) workspace.inert = true
    const focusable = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
        ),
      ].filter((node) => node.getClientRects().length > 0)
    focusable()[0]?.focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable(),
        first = items[0],
        last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    dialog.addEventListener('keydown', keyboard)
    return () => {
      dialog.removeEventListener('keydown', keyboard)
      desktopDialogs--
      if (workspace && desktopDialogs === 0) workspace.inert = false
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  const dialog = (
    <dialog
      ref={ref}
      open={isDesktop() || undefined}
      aria-label={title}
      aria-modal="true"
      onCancel={onClose}
      onClick={(event) => {
        if (!isDesktop() && event.target === event.currentTarget) onClose()
      }}
    >
      {children}
    </dialog>
  )
  return isDesktop()
    ? createPortal(
        <div
          className="desktop-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          {dialog}
        </div>,
        document.body,
      )
    : dialog
}
