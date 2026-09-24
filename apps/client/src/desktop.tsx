import { useEffect, useState, type ReactNode } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, Copy, X } from 'lucide-react'
import { isDesktop } from './platform'
import { t } from './i18n'
import './desktop.css'

export function DesktopShell({ children }: { children: ReactNode }) {
  const [maximized, setMaximized] = useState(false)
  const [error, setError] = useState('')
  const [, refreshLocale] = useState(0)
  useEffect(() => {
    if (!isDesktop()) return
    document.documentElement.classList.add('desktop')
    const window = getCurrentWindow()
    const update = () =>
      window
        .isMaximized()
        .then(setMaximized)
        .catch(() => {})
    void update()
    const listener = window.onResized(update)
    const observer = new MutationObserver(() => refreshLocale((n) => n + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => {
      observer.disconnect()
      listener.then((fn) => fn())
      document.documentElement.classList.remove('desktop')
    }
  }, [])
  if (!isDesktop()) return children
  const action = (fn: () => Promise<void>) => {
    void fn().catch(() => setError(t('Action impossible. Réessayez.')))
  }
  return (
    <div className="desktop-shell">
      <header className="window-bar">
        <div className="window-drag" data-tauri-drag-region>
          <img src="/brand/primio.png" alt="" draggable={false} />
          <span>Primio</span>
        </div>
        <div className="window-actions">
          <button
            aria-label={t('Réduire la fenêtre')}
            title={t('Réduire la fenêtre')}
            onClick={() => action(() => getCurrentWindow().minimize())}
          >
            <Minus />
          </button>
          <button
            aria-label={t(maximized ? 'Restaurer la fenêtre' : 'Agrandir la fenêtre')}
            title={t(maximized ? 'Restaurer la fenêtre' : 'Agrandir la fenêtre')}
            onClick={() => action(() => getCurrentWindow().toggleMaximize())}
          >
            {maximized ? <Copy /> : <Square />}
          </button>
          <button
            className="window-close"
            aria-label={t('Fermer la fenêtre')}
            title={t('Fermer la fenêtre')}
            onClick={() => action(() => getCurrentWindow().close())}
          >
            <X />
          </button>
        </div>
      </header>
      {error && (
        <button className="window-error" role="alert" onClick={() => setError('')}>
          {error}
        </button>
      )}
      <div className="desktop-workspace">{children}</div>
    </div>
  )
}
