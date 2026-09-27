import { useEffect, useRef, useState } from 'react'
import type { Profile } from './types'
import { DialogShell } from './dialog-shell'
import { readSecure, writeSecure } from './platform'
import { t } from './i18n'
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
export async function hashPin(pin: string, salt: string) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bytes = Uint8Array.from(salt.match(/../g) ?? [], (v) => parseInt(v, 16))
  return hex(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: bytes, iterations: 600000, hash: 'SHA-256' },
        material,
        256,
      ),
    ),
  )
}
export async function createPin(pin: string) {
  if (!/^\d{4,8}$/.test(pin)) throw Error(t('Utilisez de 4 à 8 chiffres.'))
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  return { salt, hash: await hashPin(pin, salt) }
}
export function useProfilePin(account: string) {
  const [target, setTarget] = useState<Profile | null>(null),
    [pin, setPin] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0)
  const unlocked = useRef(new Map<string, string>()),
    resolve = useRef<((value: boolean) => void) | null>(null),
    scope = useRef(account)
  useEffect(() => {
    scope.current = account
    unlocked.current.clear()
    resolve.current?.(false)
    resolve.current = null
    setTarget(null)
    setRevision((r) => r + 1)
  }, [account])
  const isUnlocked = (p: Profile | undefined) =>
    !p?.pin || unlocked.current.get(account + ':' + p.id) === p.pin.hash
  const allow = (p: Profile) => {
    if (p.pin) unlocked.current.set(account + ':' + p.id, p.pin.hash)
    setRevision((r) => r + 1)
  }
  const unlock = (p: Profile): Promise<boolean> => {
    if (isUnlocked(p)) return Promise.resolve(true)
    resolve.current?.(false)
    setPin('')
    setError('')
    setTarget(p)
    return new Promise((r) => {
      resolve.current = r
    })
  }
  const close = () => {
    if (busy) return
    resolve.current?.(false)
    resolve.current = null
    setTarget(null)
  }
  const check = async () => {
    if (!target?.pin || busy) return
    setBusy(true)
    setError('')
    const owner = account
    try {
      const raw = await readSecure('profilePinAttempts')
      let attempts: Record<string, { count: number; until: number }> = {}
      try {
        attempts = raw ? JSON.parse(raw) : {}
      } catch {}
      const key = owner + ':' + target.id,
        record = attempts[key] ?? { count: 0, until: 0 }
      if (record.until > Date.now()) {
        setError(t('Trop de tentatives. Réessayez dans une minute.'))
        return
      }
      const hash = await hashPin(pin, target.pin.salt)
      if (scope.current !== owner) return
      if (hash !== target.pin.hash) {
        const count = record.count + 1
        attempts[key] = { count, until: count >= 5 ? Date.now() + 60000 : 0 }
        await writeSecure('profilePinAttempts', JSON.stringify(attempts))
        setPin('')
        setError(t('PIN incorrect.'))
        return
      }
      delete attempts[key]
      await writeSecure('profilePinAttempts', JSON.stringify(attempts))
      allow(target)
      resolve.current?.(true)
      resolve.current = null
      setTarget(null)
    } catch {
      setError(t('Impossible de vérifier le PIN. Réessayez.'))
    } finally {
      setBusy(false)
    }
  }
  const dialog = target ? (
    <DialogShell title={t('PIN du profil')} onClose={close} className="pin-dialog">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void check()
        }}
      >
        <h2>{target.name}</h2>
        <label className="field">
          {t('PIN du profil')}
          <input
            autoFocus
            inputMode="numeric"
            type="password"
            autoComplete="off"
            minLength={4}
            maxLength={8}
            pattern="[0-9]{4,8}"
            required
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={close}>
            {t('Annuler')}
          </button>
          <button className="primary" disabled={busy || pin.length < 4}>
            {t(busy ? 'Vérification…' : 'Déverrouiller')}
          </button>
        </div>
      </form>
    </DialogShell>
  ) : null
  return { unlock, isUnlocked, allow, dialog, revision }
}
export function PinSettings({
  profile,
  unlock,
  onChange,
}: {
  profile: Profile
  unlock: (p: Profile) => Promise<boolean>
  onChange: (pin: Profile['pin']) => void
}) {
  const [open, setOpen] = useState(false),
    [pin, setPin] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    setOpen(false)
    setPin('')
    setConfirmation('')
  }, [profile.id])
  return (
    <section className="pin-settings">
      <button
        className="row"
        onClick={async () => {
          if (await unlock(profile)) {
            setOpen(true)
            setError('')
          }
        }}
      >
        {t(profile.pin ? 'Modifier le PIN du profil' : 'Protéger ce profil par un PIN')}
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (pin !== confirmation) {
              setError(t('Les codes ne correspondent pas.'))
              return
            }
            setBusy(true)
            try {
              onChange(await createPin(pin))
              setOpen(false)
              setPin('')
              setConfirmation('')
            } catch (e) {
              setError(String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          <label className="field">
            {t('Nouveau PIN (4 à 8 chiffres)')}
            <input
              inputMode="numeric"
              type="password"
              pattern="[0-9]{4,8}"
              minLength={4}
              maxLength={8}
              required
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <label className="field">
            {t('Confirmer le PIN')}
            <input
              inputMode="numeric"
              type="password"
              maxLength={8}
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="dialog-actions">
            <button disabled={busy} className="primary">
              {t('Enregistrer')}
            </button>
            {profile.pin && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                {t('Retirer le PIN')}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)}>
              {t('Annuler')}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
