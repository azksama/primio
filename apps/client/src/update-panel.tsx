import { useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Download, RefreshCw } from './icons'
import { DialogShell } from './dialog-shell'
import { t } from './i18n'
interface Update {
  version: string
  size: number
  downloaded: boolean
}
export function UpdatePanel({ ready }: { ready: boolean }) {
  const [update, setUpdate] = useState<Update | null>(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [downloaded, setDownloaded] = useState(false),
    [error, setError] = useState(''),
    [progress, setProgress] = useState(0)
  const check = async (manual = false) => {
    try {
      const next = await invoke<Update | null>('update_check')
      setUpdate(next)
      setDownloaded(next?.downloaded ?? false)
      setProgress(next?.downloaded ? 1 : 0)
      setError('')
      if (next || manual) setOpen(true)
    } catch (e) {
      if (manual) {
        setError(String(e))
        setOpen(true)
      }
    }
  }
  useEffect(() => {
    if (!ready || !isTauri()) return
    void check()
  }, [ready])
  useEffect(() => {
    if (!isTauri()) return
    const stop = listen<{ received: number; total: number }>('update-progress', (e) =>
      setProgress(e.payload.total > 0 ? Math.max(0, Math.min(1, e.payload.received / e.payload.total)) : 0),
    )
    return () => {
      void stop.then((fn) => fn())
    }
  }, [])
  useEffect(() => {
    const handler = () => void check(true)
    window.addEventListener('primio-check-update', handler)
    return () => window.removeEventListener('primio-check-update', handler)
  }, [])
  if (!open) return null
  return (
    <DialogShell
      title={t('Mises à jour')}
      onClose={() => {
        if (!busy) setOpen(false)
      }}
    >
      <h2>{t(update ? 'Mise à jour disponible' : 'Mises à jour')}</h2>
      <p>
        {update
          ? `Primio ${update.version} · ${Math.ceil(update.size / 1e6)} MB`
          : error
            ? ''
            : t('Votre application est à jour.')}
      </p>
      {update && (busy || downloaded) && <div className="update-transfer" role="status">
        <div className="update-transfer-label"><strong>{t(downloaded ? 'Prête à installer' : 'Téléchargement…')}</strong><span>{Math.round(progress * 100)} %</span></div>
        <progress value={progress} max={1} aria-label={t('Téléchargement')} />
        <small>{downloaded ? t('Le fichier a été vérifié. Vous pouvez reprendre l’installation.') : `${Math.round(progress * update.size / 1e6)} / ${Math.ceil(update.size / 1e6)} MB`}</small>
      </div>}
      {error && <p role="alert">{error}</p>}
      {update && (
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              if (downloaded) await invoke('update_install')
              else {
                await invoke('update_download')
                setDownloaded(true)
              }
            } catch (e) {
              setError(String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? <RefreshCw /> : <Download />}
          {t(
            busy
              ? downloaded ? 'Installation…' : 'Téléchargement…'
              : downloaded
                ? 'Installer et redémarrer'
                : 'Télécharger la mise à jour',
          )}
        </button>
      )}
      <button className="secondary" disabled={busy} onClick={() => setOpen(false)}>
        {t(update ? 'Plus tard' : 'Fermer')}
      </button>
    </DialogShell>
  )
}
