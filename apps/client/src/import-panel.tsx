import { useState, type Dispatch, type SetStateAction } from 'react'
import { Upload } from 'lucide-react'
import { Choice, Toggle } from './components'
import { PasswordField } from './password-field'
import {
  importAnilist,
  importStremio,
  readImport,
  mergeImport,
  type ImportPreview,
} from './imports'
import { t } from './i18n'
import type { UserState } from './types'
export function ImportPanel({
  state,
  setState,
  onDone,
  onBusyChange,
}: {
  state: UserState
  setState: Dispatch<SetStateAction<UserState>>
  onDone: () => void
  onBusyChange?: (busy: boolean) => void
}) {
  const [provider, setProvider] = useState('stremio'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null),
    [selectedAddons, setSelectedAddons] = useState<string[]>([]),
    [addons, setAddons] = useState(true),
    [library, setLibrary] = useState(true)
  const load = async (action: () => Promise<ImportPreview>) => {
    setBusy(true)
    onBusyChange?.(true)
    setError('')
    setPreview(null)
    try {
      const result = await action()
      setPreview(result)
      setSelectedAddons(result.addons.map((addon) => addon.url))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      onBusyChange?.(false)
    }
  }
  return (
    <section className="import-panel">
      <Choice
        label={t('Service')}
        value={provider}
        options={[
          ['stremio', 'Stremio'],
          ['anilist', 'AniList'],
          ['file', t('Fichier · MyAnimeList, Trakt, Stremio')],
        ]}
        onChange={(value) => {
          if (busy) return
          setProvider(value)
          setPreview(null)
          setError('')
        }}
      />
      {provider === 'file' ? (
        <label className="field">
          {t('Exporter votre liste puis choisir le fichier JSON, CSV, XML ou XML.gz.')}
          <input
            type="file"
            accept=".json,.csv,.xml,.gz"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void load(() => readImport(file))
              e.target.value = ''
            }}
          />
        </label>
      ) : (
        <form
          key={provider}
          onSubmit={(e) => {
            e.preventDefault()
            const form = e.currentTarget
            const data = new FormData(form)
            const user = String(data.get('user') ?? '')
            const password = String(data.get('password') ?? '')
            form.reset()
            void load(() =>
              provider === 'anilist' ? importAnilist(user) : importStremio(user, password),
            )
          }}
        >
          <label className="field">
            {t(provider === 'anilist' ? 'Nom d’utilisateur' : 'Adresse e-mail')}
            <input
              name="user"
              type={provider === 'anilist' ? 'text' : 'email'}
              required
              maxLength={254}
            />
          </label>
          {provider === 'stremio' && (
            <label className="field">
              {t('Mot de passe')}
              <PasswordField name="password" autoComplete="off" required maxLength={256} />
            </label>
          )}
          <button className="secondary" disabled={busy}>
            <Upload />
            {t(busy ? 'Chargement…' : 'Prévisualiser l’import')}
          </button>
          <p className="muted">
            {t(
              provider === 'anilist'
                ? 'Votre liste AniList doit être publique.'
                : 'Connexion directe à Stremio. Vos identifiants ne sont pas enregistrés.',
            )}
          </p>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {preview && (
        <div className="import-preview">
          <Toggle
            label={t('{n} titres', { n: preview.library.length })}
            checked={library}
            onChange={setLibrary}
          />
          {!!preview.addons.length && (
            <Toggle
              label={t('{n} addons installés', { n: preview.addons.length })}
              checked={addons}
              onChange={setAddons}
            />
          )}
          {!!preview.skipped && (
            <p className="muted">{t('{n} éléments non reconnus', { n: preview.skipped })}</p>
          )}
          {addons &&
            preview.addons.map((addon) => (
              <label className="import-addon" key={addon.url}>
                <input
                  type="checkbox"
                  checked={selectedAddons.includes(addon.url)}
                  onChange={(e) =>
                    setSelectedAddons((selected) =>
                      e.target.checked
                        ? [...selected, addon.url]
                        : selected.filter((url) => url !== addon.url),
                    )
                  }
                />
                <span>{addon.name || new URL(addon.url).hostname}</span>
              </label>
            ))}
          <ul>
            {preview.library.slice(0, 8).map((m) => (
              <li key={m.type + m.id}>{m.name}</li>
            ))}
          </ul>
          <button
            className="primary"
            disabled={!((library && preview.library.length) || (addons && selectedAddons.length))}
            onClick={() => {
              try {
                setState((current) =>
                  mergeImport(
                    current,
                    {
                      ...preview,
                      addons: preview.addons.filter((addon) => selectedAddons.includes(addon.url)),
                    },
                    addons,
                    library,
                  ),
                )
                onDone()
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            {t('Importer')}
          </button>
        </div>
      )}
    </section>
  )
}
