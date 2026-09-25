import { useEffect, useState } from 'react'
import { Mail, CheckCircle2 } from 'lucide-react'
import { api } from './platform'
import { DialogShell } from './dialog-shell'
import { t } from './i18n'

export interface VerificationChallenge {
  verificationRequired: true
  challenge: string
  email: string
  retryAfter: number
}
export interface Authenticated {
  token: string
  user: { username?: string; email?: string }
}
export function EmailVerification({
  initial,
  onVerified,
  onClose,
}: {
  initial: VerificationChallenge
  onVerified: (result: Authenticated) => Promise<void>
  onClose: () => void
}) {
  const [challenge, setChallenge] = useState(initial),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [remaining, setRemaining] = useState(initial.retryAfter)
  useEffect(() => {
    const timer = setInterval(() => setRemaining((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <DialogShell
      title={t('Vérifier votre adresse e-mail')}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <div className="verification-intro">
        <Mail />
        <h2>{t('Vérifiez votre boîte mail')}</h2>
        <p>
          {t('Saisissez le code à 6 chiffres envoyé à')} <strong>{challenge.email}</strong>.
        </p>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          try {
            const result = await api<Authenticated>('/auth/verify-email', 'POST', {
              challenge: challenge.challenge,
              code,
            })
            await onVerified(result)
          } catch (e) {
            setError(t(e instanceof Error ? e.message : String(e)))
          } finally {
            setBusy(false)
          }
        }}
      >
        <label className="field">
          {t('Code de vérification')}
          <input
            className="verification-code"
            aria-label={t('Code de vérification')}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </label>
        <p className="muted">
          {t('Le code expire dans 10 minutes. Pensez à vérifier vos courriers indésirables.')}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || code.length !== 6}>
          <CheckCircle2 />
          {t('Confirmer mon adresse')}
        </button>
        <button
          className="secondary"
          type="button"
          disabled={busy || remaining > 0}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              const next = await api<VerificationChallenge>('/auth/resend-code', 'POST', {
                challenge: challenge.challenge,
              })
              setChallenge(next)
              setRemaining(next.retryAfter)
              setCode('')
            } catch (e) {
              setError(t(e instanceof Error ? e.message : String(e)))
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('Renvoyer le code')}
          {remaining > 0 ? ` · ${remaining}s` : ''}
        </button>
      </form>
    </DialogShell>
  )
}
