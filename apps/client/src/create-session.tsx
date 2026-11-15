import { useState, type Dispatch, type SetStateAction } from 'react'
import { AvatarPicker } from './components'
import { Dialog } from './app-ui'
import { Plus } from './icons'
import { t } from './i18n'
import { defaults, freeAvatar, profileColors, snapshotState, switchProfile } from './preferences'
import type { UserState } from './types'

export function CreateSession({
  state,
  setState,
  onCreated,
}: {
  state: UserState
  setState: Dispatch<SetStateAction<UserState>>
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('01')
  if (state.profiles.length >= 6) return null
  return (
    <>
      <button
        className="secondary"
        onClick={() => {
          setName('')
          setAvatar(freeAvatar(state.profiles))
          setOpen(true)
        }}
      >
        <Plus />
        {t('Créer ma session')}
      </button>
      {open && (
        <Dialog title={t('Créer ma session')} onClose={() => setOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              const id = crypto.randomUUID()
              setState((s) => {
                if (s.profiles.length >= 6) return s
                const profile = {
                  id,
                  name: name.trim(),
                  avatar: s.profiles.some((p) => p.avatar === avatar)
                    ? freeAvatar(s.profiles)
                    : avatar,
                  color: profileColors[s.profiles.length % profileColors.length],
                  library: [],
                  progress: [],
                  collections: [],
                  settings: { ...defaults, uiLanguage: s.settings.uiLanguage },
                }
                const saved = snapshotState(s)
                return switchProfile({ ...saved, profiles: [...saved.profiles, profile] }, id)
              })
              setOpen(false)
              onCreated()
            }}
          >
            <label className="field">
              {t('Nom du profil')}
              <input
                autoFocus
                required
                maxLength={32}
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <AvatarPicker
              value={avatar}
              profiles={state.profiles}
              editing={null}
              onChange={setAvatar}
            />
            <button className="primary" disabled={!name.trim()}>
              {t('Créer ma session')}
            </button>
          </form>
        </Dialog>
      )}
    </>
  )
}
