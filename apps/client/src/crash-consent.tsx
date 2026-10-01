import { useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { diagnostics, redactDiagnostic, sendDiagnostics } from './diagnostics'
import { DialogShell } from './dialog-shell'
import { t } from './i18n'

const reviewedKey = 'primio-crash-reviewed-v1'
export function CrashConsent({ ready, token, onPending }: { ready: boolean; token: string | null; onPending: (pending: boolean) => void }) {
  const [report, setReport] = useState<{ id: string; detail: string } | null>(null)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!ready) return
    let active = true
    void (async () => {
      const native = isTauri() ? await invoke<string>('crash_report').catch(() => '') : ''
      const recent = diagnostics().filter(d => ['crash', 'javascript'].includes(d.kind)).slice(-3)
      const detail = redactDiagnostic([native, ...recent.map(d => `${d.time} · ${d.kind}\n${d.detail}`)].filter(Boolean).join('\n\n'))
      if (!detail) { if (active) onPending(false); return }
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(detail))
      const id = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
      if (active) {
        const pending = localStorage.getItem(reviewedKey) !== id
        onPending(pending)
        if (pending) setReport({ id, detail })
      }
    })().catch(() => { if (active) onPending(false) })
    return () => { active = false }
  }, [ready, onPending])
  if (!report) return null
  const later = () => { setReport(null); onPending(false) }
  const dismiss = () => { localStorage.setItem(reviewedKey, report.id); later() }
  return <DialogShell title={t('Un arrêt inattendu a été détecté')} onClose={() => { if (!busy) later() }}>
    <p>{t('Aidez-nous à comprendre ce problème. Le rapport masque les adresses, liens et identifiants privés. Il sera envoyé uniquement avec votre accord.')}</p>
    <button className="secondary" onClick={() => setPreview(!preview)} aria-expanded={preview}>{t('Consulter le rapport')}</button>
    {preview && <textarea className="crash-preview" aria-label={t('Rapport de diagnostic')} value={report.detail} readOnly rows={8} />}
    {!token && <p className="muted">{t('Connectez-vous pour envoyer un rapport.')}</p>}
    {error && <p role="alert">{error}</p>}
    <div className="crash-actions">
      <button className="primary" disabled={busy || !token} onClick={async () => {
        setBusy(true); setError('')
        try { await sendDiagnostics(token!, report.detail, 'crash'); dismiss() }
        catch { setError(t('Envoi impossible. Réessayez plus tard.')) }
        finally { setBusy(false) }
      }}>{t(busy ? 'Envoi…' : 'Envoyer le rapport')}</button>
      <button className="secondary" disabled={busy} onClick={dismiss}>{t('Ne pas envoyer')}</button>
      <button className="secondary" disabled={busy} onClick={later}>{t('Plus tard')}</button>
    </div>
  </DialogShell>
}
