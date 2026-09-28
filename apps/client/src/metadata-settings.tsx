import { useEffect, useState } from 'react'
import { tmdbToken, saveTmdbToken, validateTmdbToken } from './metadata-provider'
import { PasswordField } from './password-field'
import { openLink } from './platform'
import { t } from './i18n'
import { Check, LoaderCircle } from './icons'

export function MetadataSettings({ accountId }: { accountId: string }) {
  const [token, setToken] = useState(''), [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    tmdbToken(accountId).then(value => { if (active) { setSaved(!!value); setReady(true) } })
      .catch(() => { if (active) setError(t('Impossible de lire le jeton enregistré.')) })
    return () => { active = false }
  }, [accountId])
  const save = async (remove = false) => {
    setBusy(true); setError('')
    try {
      const value = remove ? '' : token.trim()
      if (!remove) await validateTmdbToken(value)
      await saveTmdbToken(accountId, value)
      setSaved(!remove); setToken('')
    } catch (e) {
      setError(t(String(e).includes('TMDB_INVALID_TOKEN') ? 'Jeton TMDB invalide. Vérifiez votre API Read Access Token.' : 'Connexion à TMDB impossible. Réessayez.'))
    } finally { setBusy(false) }
  }
  return <section className="metadata-settings integration-card">
    <div className="metadata-heading"><h2>TMDB</h2>{saved && <span><Check size={16} />{t('Connecté')}</span>}</div>
    <p className="muted">{t('Utilisez votre jeton personnel pour découvrir des films et des séries. Il est conservé dans le coffre sécurisé de cet appareil, pour votre compte.')}</p>
    <form onSubmit={e => { e.preventDefault(); void save() }}>
      <label htmlFor="tmdb-token">API Read Access Token</label>
      <PasswordField id="tmdb-token" value={token} onChange={e => setToken(e.target.value)}
        autoComplete="off" spellCheck={false} placeholder={saved ? t('Remplacer le jeton') : t('Coller votre jeton TMDB')}
        disabled={!ready || busy} maxLength={2048} />
      <div className="metadata-actions">
        <button className="primary" disabled={!ready || busy || !token.trim()}>{busy && <LoaderCircle className="spin" size={17} />}{t('Vérifier et enregistrer')}</button>
        {saved && <button type="button" className="secondary" disabled={busy} onClick={() => void save(true)}>{t('Déconnecter')}</button>}
        <button type="button" className="metadata-help" onClick={() => void openLink('https://www.themoviedb.org/settings/api')}>{t('Obtenir mon jeton')}</button>
      </div>
    </form>
    {error && <p role="alert">{error}</p>}
    <small className="muted">{t('AniList reste disponible pour les animes sans jeton.')}</small>
  </section>
}
