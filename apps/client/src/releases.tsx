import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Bell, RefreshCw } from 'lucide-react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { version } from '../package.json'
import { metadata } from './addons'
import { readSecure, writeSecure, api, openLink } from './platform'
import { isWatched, findProgress } from './progress'
import { Toggle } from './components'
import { t, locale } from './i18n'
import type { Addon, Meta, Settings, UserState, Progress } from './types'
export interface ReleaseEntry {
  id: string
  meta: Meta
  videoId: string
  title: string
  at: number
  season: number
  episode: number
  unconfirmed?: boolean
}
export function releaseEntries(metas: Meta[]): ReleaseEntry[] {
  const unique = new Map<string, ReleaseEntry>()
  for (const meta of metas)
    for (const video of meta.videos ?? []) {
      const at = Date.parse(video.released ?? '')
      if (!Number.isFinite(at)) continue
      const id = meta.type + ':' + meta.id + ':' + video.id
      unique.set(id, {
        id,
        meta,
        videoId: video.id,
        title: video.title || video.name || '',
        at,
        season: video.season ?? 1,
        episode: video.episode ?? 0,
        unconfirmed: video.releaseUnconfirmed,
      })
    }
  return [...unique.values()].sort((a, b) => a.at - b.at)
}
export function titleWatched(meta: Meta, progress: Progress[], metas: Meta[]) {
  if (isWatched(findProgress(progress, meta.type, meta.id))) return true
  if (meta.type === 'movie') return false
  const full = metas.find((m) => m.id === meta.id && m.type === meta.type)
  const released =
    full?.videos?.filter(
      (v) => (v.season ?? 1) > 0 && (!v.released || Date.parse(v.released) <= Date.now()),
    ) ?? []
  return (
    released.length > 0 && released.every((v) => isWatched(findProgress(progress, meta.type, v.id)))
  )
}
export function newerVersion(candidate: string, current: string) {
  const a = candidate.split('.').map(Number),
    b = current.split('.').map(Number)
  if (a.length !== 3 || a.some((n) => !Number.isInteger(n) || n < 0)) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}
const cache = new Map<string, { time: number; meta: Meta }>()
interface InboxRecord {
  since: number
  read: string[]
}
export function useReleases(state: UserState, addons: Addon[], ready: boolean, account: string) {
  const [metas, setMetas] = useState<Meta[]>([]),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [now, setNow] = useState(Date.now())
  const [inbox, setInbox] = useState<InboxRecord>({ since: Date.now(), read: [] }),
    [inboxScope, setInboxScope] = useState('')
  const [catalogLoadedKey, setCatalogLoadedKey] = useState('')
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null),
    [failed, setFailed] = useState(false)
  const scope = account + ':' + state.activeProfileId
  const signature = JSON.stringify([state.library, addons.map((a) => [a.url, a.enabled])])
  const inboxReady = inboxScope === scope
  const catalogKey = scope + signature
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    let active = true
    setInboxScope('')
    setUpdate(null)
    if (isTauri())
      void invoke('notification_config', {
        data: JSON.stringify({ scope, episodes: false, updates: false, entries: [] }),
      }).catch(() => {})
    void readSecure('notifications')
      .then((raw) => {
        const records = raw ? JSON.parse(raw) : {}
        if (active) {
          setInbox(records[scope] ?? { since: Date.now(), read: [] })
          setInboxScope(scope)
        }
      })
      .catch(() => {
        if (active) {
          setInbox({ since: Date.now(), read: [] })
          setInboxScope(scope)
        }
      })
    return () => {
      active = false
    }
  }, [scope])
  useEffect(() => {
    if (!inboxReady) return
    let active = true
    void readSecure('notifications')
      .then((raw) => {
        if (!active) return
        const all = raw ? JSON.parse(raw) : {}
        all[scope] = inbox
        return writeSecure('notifications', JSON.stringify(all))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [scope, inbox, inboxReady])
  useEffect(() => {
    if (!ready) return
    let active = true
    setMetas([])
    setLoading(true)
    setFailed(false)
    const queue = state.library.filter((m) => m.type !== 'movie')
    const found: Meta[] = []
    async function work() {
      while (active && queue.length) {
        const m = queue.shift()!
        const key = JSON.stringify([m.type, m.id, addons.map((a) => a.url)])
        const stored = cache.get(key)
        try {
          const full =
            stored && Date.now() - stored.time < 6 * 3600000 && refresh === 0
              ? stored.meta
              : await metadata(addons, m)
          if (!active) return
          if (full.videos) {
            cache.set(key, { time: Date.now(), meta: full })
            found.push(full)
            setMetas([...found])
          } else setFailed(true)
        } catch {
          if (active) setFailed(true)
        }
      }
    }
    void Promise.all(Array.from({ length: 3 }, work)).finally(() => {
      if (active) {
        setLoading(false)
        setCatalogLoadedKey(catalogKey)
      }
    })
    void api<{ version: string; url: string }>('/app-release')
      .then((r) => {
        if (
          active &&
          newerVersion(r.version, version) &&
          /^https:\/\/github.com\/azksama\/primio\/releases\//.test(r.url)
        )
          setUpdate(r)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [signature, ready, scope, refresh])
  const entries = releaseEntries(metas)
  useEffect(() => {
    if (!ready || !inboxReady || loading || catalogLoadedKey !== catalogKey || !isTauri()) return
    const future = entries
      .filter((e) => !e.unconfirmed && e.at >= inbox.since && e.at > now - 7 * 86400000)
      .slice(0, 1000)
      .map((e) => ({
        id: e.id,
        title: e.meta.name,
        body: [e.title, `S${e.season} · E${e.episode}`].filter(Boolean).join(' · '),
        at: e.at,
      }))
    void invoke('notification_config', {
      data: JSON.stringify({
        scope,
        locale: state.settings.uiLanguage,
        episodes: state.settings.episodeNotifications,
        updates: state.settings.updateNotifications,
        entries: future,
        since: inbox.since,
      }),
    }).catch(() => {})
  }, [
    loading,
    catalogLoadedKey,
    catalogKey,
    ready,
    signature,
    scope,
    inboxReady,
    state.settings.episodeNotifications,
    state.settings.updateNotifications,
    state.settings.uiLanguage,
    entries.map((e) => e.id + e.at).join('|'),
  ])
  return {
    metas,
    entries,
    loading,
    failed,
    update,
    now,
    inbox,
    refresh: () => setRefresh((n) => n + 1),
    markRead: (id: string) =>
      setInbox((s) => ({ ...s, read: [...new Set([...s.read, id])].slice(-1000) })),
  }
}
type Releases = ReturnType<typeof useReleases>
function Entry({ entry, onSelect }: { entry: ReleaseEntry; onSelect: (meta: Meta) => void }) {
  return (
    <button className="release-item glass" onClick={() => onSelect(entry.meta)}>
      {entry.meta.poster && <img src={entry.meta.poster} alt="" loading="lazy" />}
      <span>
        <strong>{entry.meta.name}</strong>
        <span>{entry.title}</span>
        <small>
          {t('S')}
          {entry.season} {t('· E')}
          {entry.episode} ·{' '}
          {new Date(entry.at).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}
          {entry.unconfirmed && ' · ' + t('Date à confirmer')}
        </small>
      </span>
    </button>
  )
}
export function ReleaseCalendar({
  releases,
  onSelect,
}: {
  releases: Releases
  onSelect: (meta: Meta) => void
}) {
  const [month, setMonth] = useState(
      () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    [day, setDay] = useState(new Date().getDate())
  const year = month.getFullYear(),
    m = month.getMonth(),
    days = new Date(year, m + 1, 0).getDate(),
    offset = (month.getDay() + 6) % 7
  const sameDay = (e: ReleaseEntry, d: number) => {
    const date = new Date(e.at)
    return date.getFullYear() === year && date.getMonth() === m && date.getDate() === d
  }
  const visible = releases.entries.filter((e) => sameDay(e, day))
  const change = (delta: number) => {
    setMonth(new Date(year, m + delta, 1))
    setDay(1)
  }
  return (
    <>
      <div className="release-month">
        <button className="icon" aria-label={t('Mois précédent')} onClick={() => change(-1)}>
          <ChevronLeft />
        </button>
        <h2>{month.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}</h2>
        <button className="icon" aria-label={t('Mois suivant')} onClick={() => change(1)}>
          <ChevronRight />
        </button>
      </div>
      <div className="calendar-grid">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={'weekday' + i}>
            {new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' })}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={'blank' + i} />
        ))}
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            aria-pressed={day === d}
            className={
              (day === d ? 'selected ' : '') +
              (releases.entries.some((e) => sameDay(e, d)) ? 'has-release' : '')
            }
            onClick={() => setDay(d)}
          >
            <span>{d}</span>
            {releases.entries.some((e) => sameDay(e, d)) && (
              <span
                className="release-count"
                aria-label={t('{n} sorties', {
                  n: releases.entries.filter((e) => sameDay(e, d)).length,
                })}
              >
                {releases.entries.filter((e) => sameDay(e, d)).length}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="release-list">
        {visible.map((e) => (
          <Entry key={e.id} entry={e} onSelect={onSelect} />
        ))}
        {releases.loading && <p role="status">{t('Chargement…')}</p>}
        {!visible.length && !releases.loading && (
          <p className="muted">{t('Aucune sortie ce jour.')}</p>
        )}
        {releases.failed && <p className="muted">{t('Certains catalogues sont indisponibles.')}</p>}
        <button className="secondary" disabled={releases.loading} onClick={releases.refresh}>
          <RefreshCw />
          {t('Actualiser')}
        </button>
      </div>
    </>
  )
}
export function NotificationCenter({
  releases,
  settings,
  onSettings,
  onSelect,
}: {
  releases: Releases
  settings: Settings
  onSettings: (s: Settings) => void
  onSelect: (meta: Meta) => void
}) {
  const [permission, setPermission] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isTauri()) return
    const check = () =>
      invoke<{ enabled: boolean }>('notification_permission', { request: false })
        .then((r) => setPermission(r.enabled))
        .catch(() => setPermission(false))
    void check()
    const timer = setInterval(check, 1500)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', check)
    }
  }, [])
  const episodes = releases.entries
    .filter((e) => !e.unconfirmed && e.at <= releases.now && e.at >= releases.inbox.since)
    .sort((a, b) => b.at - a.at)
    .slice(0, 100)
  return (
    <>
      <Toggle
        label={t('Sorties des épisodes')}
        checked={settings.episodeNotifications}
        onChange={(v) => onSettings({ ...settings, episodeNotifications: v })}
      />
      <Toggle
        label={t('Mises à jour de Primio')}
        checked={settings.updateNotifications}
        onChange={(v) => onSettings({ ...settings, updateNotifications: v })}
      />
      {isTauri() && permission !== true && (
        <button
          className="secondary"
          onClick={() =>
            void invoke<{ enabled: boolean }>('notification_permission', { request: true })
              .then((r) => setPermission(r.enabled))
              .catch(() => setError(t('Notifications indisponibles.')))
          }
        >
          <Bell />
          {t('Autoriser les notifications')}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="release-list">
        {releases.update && (
          <button
            className="release-item glass"
            onClick={() => {
              releases.markRead('update:' + releases.update!.version)
              void openLink(releases.update!.url).catch(() =>
                setError(t('Impossible d’ouvrir le lien.')),
              )
            }}
          >
            <RefreshCw />
            <span>
              <strong>{t('Mise à jour disponible')}</strong>
              <small>Primio {releases.update.version}</small>
            </span>
          </button>
        )}
        {episodes.map((e) => (
          <div
            key={e.id}
            className={
              releases.inbox.read.includes(e.id) ? 'notification-read' : 'notification-new'
            }
          >
            <Entry
              entry={e}
              onSelect={(m) => {
                releases.markRead(e.id)
                onSelect(m)
              }}
            />
          </div>
        ))}
        {!episodes.length && !releases.update && (
          <p className="muted">{t('Aucune nouvelle notification.')}</p>
        )}
        <button className="secondary" disabled={releases.loading} onClick={releases.refresh}>
          <RefreshCw />
          {t('Actualiser')}
        </button>
      </div>
    </>
  )
}
