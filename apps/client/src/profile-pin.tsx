import { useLayoutEffect, useRef, useState } from 'react'
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
    scope = useRef(account),
    request = useRef(0)
  useLayoutEffect(() => {
    ++request.current
    scope.current = account
    unlocked.current.clear()
    resolve.current?.(false)
    resolve.current = null
    setTarget(null)
    setBusy(false)
    setRevision((r) => r + 1)
    return () => {
      ++request.current
      resolve.current?.(false)
      resolve.current = null
    }
  }, [account])
  const isUnlocked = (p: Profile | undefined) =>
    !p?.pin || unlocked.current.get(account + ':' + p.id) === p.pin.hash
  const allow = (p: Profile) => {
    if (p.pin) unlocked.current.set(account + ':' + p.id, p.pin.hash)
    setRevision((r) => r + 1)
  }
  const unlock = (p: Profile): Promise<boolean> => {
    if (isUnlocked(p)) return Promise.resolve(true)
    ++request.current
    resolve.current?.(false)
    setBusy(false)
    setPin('')
    setError('')
    setTarget(p)
    return new Promise((r) => {
      resolve.current = r
    })
  }
  const close = () => {
    if (busy) return
    ++request.current
    resolve.current?.(false)
    resolve.current = null
    setTarget(null)
  }
  const check = async () => {
    if (!target?.pin || busy) return
    setBusy(true)
    setError('')
    const owner = account, sequence = request.current
    const current = () => scope.current === owner && request.current === sequence
    try {
      const raw = await readSecure('profilePinAttempts')
      if (!current()) return
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
      if (!current()) return
      if (hash !== target.pin.hash) {
        const count = record.count + 1
        attempts[key] = { count, until: count >= 5 ? Date.now() + 60000 : 0 }
        await writeSecure('profilePinAttempts', JSON.stringify(attempts))
        if (!current()) return
        setPin('')
        setError(t('PIN incorrect.'))
        return
      }
      delete attempts[key]
      await writeSecure('profilePinAttempts', JSON.stringify(attempts))
      if (!current()) return
      allow(target)
      resolve.current?.(true)
      resolve.current = null
      setTarget(null)
    } catch {
      if (current()) setError(t('Impossible de vérifier le PIN. Réessayez.'))
    } finally {
      if (current()) setBusy(false)
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
  const operation = useRef(0)
  useLayoutEffect(() => {
    ++operation.current
    setOpen(false)
    setPin('')
    setConfirmation('')
    setBusy(false)
    return () => { ++operation.current }
  }, [profile.id, profile.pin?.hash])
  return (
    <section className="pin-settings">
      <button
        className="row"
        onClick={async () => {
          const sequence = operation.current
          if (await unlock(profile) && sequence === operation.current) {
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
            const sequence = operation.current
            try {
              const created = await createPin(pin)
              if (sequence !== operation.current) return
              onChange(created)
              setOpen(false)
              setPin('')
              setConfirmation('')
            } catch (e) {
              if (sequence === operation.current) setError(String(e))
            } finally {
              if (sequence === operation.current) setBusy(false)
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
            <button type="button" onClick={() => { ++operation.current; setBusy(false); setOpen(false) }}>
              {t('Annuler')}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
