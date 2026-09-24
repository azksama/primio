import { t } from './i18n'
import { useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { Download, Play, Trash2 } from 'lucide-react'
import type { Meta, Settings } from './types'
export interface OfflineItem {
  id: string
  title: string
  status: string
  bytes: number
  total: number
  meta: { meta: Meta; videoId: string; profileId: string; accountId: string }
}
export function playerOptions(s: Settings) {
  return {
    locale: s.uiLanguage,
    language: s.audioLanguage,
    subtitleLanguage: s.subtitleLanguage,
    showSubtitles: s.subtitles,
    seekBackward: s.seekBackward,
    seekForward: s.seekForward,
    subtitleSize: s.subtitleSize,
    subtitleFont: s.subtitleFont,
    subtitleColor: s.subtitleColor,
    subtitleOutline: s.subtitleOutline,
    subtitleBackground: s.subtitleBackground,
    forceSubtitleStyle: s.forceSubtitleStyle,
    autoNextEpisode: s.autoNextEpisode,
    reduceMotion: s.reduceMotion,
    playbackSpeed: s.playbackSpeed,
    hardwareDecoding: s.hardwareDecoding,
    cacheSizeGb: s.cacheSizeGb,
    deleteWatched: s.deleteWatchedDownloads,
  }
}
export function Downloads({
  accountId,
  profileId,
  onPlay,
  onError,
}: {
  accountId: string
  profileId: string
  onPlay: (item: OfflineItem) => void
  onError: (e: unknown) => void
}) {
  const [items, setItems] = useState<OfflineItem[]>([]),
    [remove, setRemove] = useState('')
  const refresh = () =>
    invoke<{ items: OfflineItem[] }>('download_list')
      .then((r) => setItems(r.items))
      .catch(onError)
  useEffect(() => {
    if (!isTauri()) return
    let active = true
    const load = () =>
      invoke<{ items: OfflineItem[] }>('download_list')
        .then((r) => {
          if (active) setItems(r.items)
        })
        .catch((e) => {
          if (active) onError(e)
        })
    void load()
    const timer = setInterval(load, 3000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])
  const visible = items.filter(
    (i) => i.meta.profileId === profileId && i.meta.accountId === accountId,
  )
  const size = (n: number) =>
    n >= 1e9 ? (n / 1e9).toFixed(1) + ' Go' : Math.round(n / 1e6) + ' Mo'
  return (
    <section className="downloads">
      <h2>{t('Téléchargements')}</h2>
      {!isTauri() ? (
        <p className="muted">
          {t('Les téléchargements hors connexion sont disponibles dans l’application Android.')}
        </p>
      ) : !visible.length ? (
        <p className="muted">{t('Aucun téléchargement.')}</p>
      ) : (
        visible.map((item) => (
          <article className="download-card glass" key={item.id}>
            <div className="row unlined">
              <Download />
              <div className="grow">
                <strong>{item.title}</strong>
                <small>
                  {(
                    {
                      complete: t('Disponible hors connexion'),
                      downloading: t('Téléchargement'),
                      queued: t('En attente'),
                      paused: t('En attente du réseau'),
                      failed: t('Échec du téléchargement'),
                      missing: t('Fichier indisponible'),
                      unsupported: t('Format hors connexion non pris en charge'),
                    } as Record<string, string>
                  )[item.status] ?? item.status}{' '}
                  · {size(item.bytes ?? 0)}
                  {item.total > 0 ? ' / ' + size(item.total) : ''}
                </small>
              </div>
              <button
                className="icon"
                aria-label={t('Lire ') + item.title}
                disabled={item.status !== 'complete'}
                onClick={() => onPlay(item)}
              >
                <Play />
              </button>
              <button
                className="icon"
                aria-label={t('Supprimer le téléchargement ') + item.title}
                onClick={() => setRemove(item.id)}
              >
                <Trash2 />
              </button>
            </div>
            {item.status !== 'complete' && item.total > 0 && (
              <progress max={item.total} value={item.bytes} />
            )}{' '}
            {remove === item.id && (
              <div>
                <p>{t('Supprimer ce téléchargement de l’appareil ?')}</p>
                <button
                  className="secondary danger"
                  onClick={async () => {
                    try {
                      await invoke('download_remove', { id: item.id })
                      setRemove('')
                      await refresh()
                    } catch (e) {
                      onError(e)
                    }
                  }}
                >
                  {t('Supprimer')}
                </button>
                <button className="secondary" onClick={() => setRemove('')}>
                  {t('Annuler')}
                </button>
              </div>
            )}
          </article>
        ))
      )}
    </section>
  )
}
