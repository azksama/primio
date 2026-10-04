import type { ReactNode } from 'react'
import { DialogShell } from './dialog-shell'
import { Clapperboard, X } from './icons'
import { t } from './i18n'

export function Dialog({
  title,
  children,
  onClose,
  error,
}: {
  error?: string
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <DialogShell title={title} onClose={onClose}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon" aria-label={t('Fermer')} onClick={onClose}>
          <X />
        </button>
      </div>
      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
      {children}
    </DialogShell>
  )
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <Clapperboard />
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  )
}
