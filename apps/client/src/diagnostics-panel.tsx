import { useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { diagnostics, clearDiagnostics, redactDiagnostic, sendDiagnostics } from './diagnostics'
import { t } from './i18n'
export function DiagnosticsPanel({ token }: { token: string | null }) {
  const [detail, setDetail] = useState(() =>
      diagnostics()
        .map((d) => `${new Date(d.time).toISOString()} · ${d.kind}\n${d.detail}`)
        .join('\n\n'),
    ),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    if (isTauri())
      void invoke<string>('crash_report')
        .then((native) => {
          if (native) setDetail((d) => [d, redactDiagnostic(native)].filter(Boolean).join('\n\n'))
        })
        .catch(() => {})
  }, [])
  return (
    <section className="diagnostics-panel">
      <p className="muted">
        {t(
          'Consultez le rapport avant de l’envoyer. Les URL, identifiants et chemins privés sont masqués. Aucun rapport n’est envoyé automatiquement.',
        )}
      </p>
      <textarea
        aria-label={t('Rapport de diagnostic')}
        rows={12}
        value={detail}
        maxLength={32768}
        onChange={(e) => setDetail(e.target.value)}
      />
      <div className="collection-actions">
        <button
          disabled={!detail || busy}
          onClick={() => {
            const blob = new Blob([redactDiagnostic(detail)], { type: 'text/plain' }),
              url = URL.createObjectURL(blob),
              a = document.createElement('a')
            a.href = url
            a.download = 'primio-diagnostic.txt'
            a.click()
            setTimeout(() => URL.revokeObjectURL(url), 1000)
          }}
        >
          {t('Exporter')}
        </button>
        <button
          disabled={!detail || busy}
          onClick={() => {
            clearDiagnostics()
            setDetail('')
            setStatus('')
          }}
        >
          {t('Effacer')}
        </button>
        <button
          className="primary"
          disabled={!token || !detail || busy}
          onClick={async () => {
            setBusy(true)
            try {
              const r = await sendDiagnostics(token!, detail)
              setStatus(t('Rapport envoyé') + ' · ' + r.id)
            } catch {
              setStatus(t('Envoi impossible. Réessayez plus tard.'))
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('Envoyer le rapport')}
        </button>
      </div>
      {!token && <p className="muted">{t('Connectez-vous pour envoyer un rapport.')}</p>}
      <p role="status">{status}</p>
    </section>
  )
}
