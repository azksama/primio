import { useEffect, useState } from 'react'
import { api, openLink } from './platform'
import { t } from './i18n'
type Status = {
  connections: {
    provider: string
    profile_id: string
    synced_at: string | null
    error: string | null
  }[]
  providers: { provider: string; configured: boolean }[]
}
export function IntegrationsPanel({
  token,
  profileId,
  prepareProfile,
}: {
  token: string
  profileId: string
  prepareProfile: () => Promise<void>
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const refresh = async () => {
    if (!token) return
    try {
      setStatus(await api<Status>('/account/integrations', 'GET', undefined, token))
    } catch {
      setError(t('Connexion au serveur impossible.'))
    }
  }
  useEffect(() => {
    void refresh()
    window.addEventListener('focus', refresh)
    const timer = setInterval(refresh, 15000)
    return () => {
      window.removeEventListener('focus', refresh)
      clearInterval(timer)
    }
  }, [token, profileId])
  const action = async (provider: string, action: string) => {
    setBusy(true)
    setError('')
    try {
      if (action === 'connect') await prepareProfile()
      const result = await api<{ url?: string }>(
        '/account/integrations',
        'POST',
        { provider, profileId, action },
        token,
      )
      if (result.url) await openLink(result.url)
      await refresh()
    } catch (e) {
      setError(
        t(
          e instanceof Error
            ? e.message
            : typeof e === 'object' && e && 'message' in e
              ? String(e.message)
              : String(e),
        ),
      )
    } finally {
      setBusy(false)
    }
  }
  if (!token) return <p>{t('Connectez-vous pour synchroniser vos services.')}</p>
  return (
    <section>
      <p className="muted">
        {t(
          'Les épisodes et films vus dans ce profil sont envoyés automatiquement aux services connectés. La progression déjà présente sur ces services est conservée.',
        )}
      </p>
      {[
        ['trakt', 'Trakt'],
        ['anilist', 'AniList'],
        ['mal', 'MyAnimeList'],
      ].map(([id, name]) => {
        const connection = status?.connections.find(
            (c) => c.provider === id && c.profile_id === profileId,
          ),
          configured = status?.providers.find((p) => p.provider === id)?.configured
        return (
          <article className="glass integration-card" key={id}>
            <h2>{name}</h2>
            <p className="muted">
              {connection
                ? connection.synced_at
                  ? t('Dernière synchronisation') +
                    ' · ' +
                    new Date(connection.synced_at).toLocaleString()
                  : t('Connecté')
                : configured
                  ? t('Non connecté')
                  : t('Configuration du service en attente')}
            </p>
            {connection?.error && <p role="status">{t(connection.error)}</p>}
            <div className="collection-actions">
              {connection ? (
                <>
                  <button disabled={busy} onClick={() => void action(id, 'sync')}>
                    {t('Synchroniser')}
                  </button>
                  <button disabled={busy} onClick={() => void action(id, 'disconnect')}>
                    {t('Déconnecter')}
                  </button>
                </>
              ) : (
                <button
                  className="primary"
                  disabled={busy || !configured}
                  onClick={() => void action(id, 'connect')}
                >
                  {t('Connecter')}
                </button>
              )}
            </div>
          </article>
        )
      })}
      <p role="alert">{error}</p>
    </section>
  )
}
