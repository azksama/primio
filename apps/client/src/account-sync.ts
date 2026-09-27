import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { api, readSecure, writeSecure } from './platform'
import { normalizeState, snapshotState } from './preferences'
import { mergePlaybackState } from './playback-sync'
import type { UserState } from './types'

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const key = (v: any): string | undefined =>
  v && typeof v === 'object'
    ? v.videoId
      ? JSON.stringify([v.type, v.videoId])
      : v.contentId
        ? 'content:' + v.contentId
        : v.id
          ? JSON.stringify([v.type, v.id])
          : v.url
    : undefined

// Three-way merge: preserve remote edits, and apply only changes made locally
// since the last successful sync. Absence relative to the baseline is a deletion.
export function mergeValue(base: any, local: any, remote: any): any {
  if (equal(local, base)) return remote
  if (equal(remote, base) || equal(local, remote)) return local
  if (
    Array.isArray(local) &&
    Array.isArray(remote) &&
    [...local, ...remote].every((v) => typeof v === 'string')
  ) {
    const b = new Set(Array.isArray(base) ? base : []),
      l = new Set(local),
      r = new Set(remote)
    return [...new Set([...local, ...remote])].filter((v) => !b.has(v) || (l.has(v) && r.has(v)))
  }
  if (Array.isArray(local) && Array.isArray(remote) && [...local, ...remote].every((v) => key(v))) {
    const b = new Map((base ?? []).map((v: any) => [key(v), v]))
    const l = new Map(local.map((v) => [key(v), v])),
      r = new Map(remote.map((v) => [key(v), v]))
    return [...new Set([...l.keys(), ...r.keys()])].flatMap((id) => {
      if (b.has(id) && (!l.has(id) || !r.has(id))) return []
      return [mergeValue(b.get(id), l.get(id), r.get(id))].filter((v) => v !== undefined)
    })
  }
  if (
    local &&
    remote &&
    !Array.isArray(local) &&
    !Array.isArray(remote) &&
    typeof local === 'object' &&
    typeof remote === 'object'
  ) {
    return Object.fromEntries(
      [...new Set([...Object.keys(local), ...Object.keys(remote)])]
        .map((k) => [k, mergeValue(base?.[k], local[k], remote[k])])
        .filter(([, v]) => v !== undefined),
    )
  }
  return local === undefined && base === undefined ? remote : local
}

export function syncSnapshot(state: UserState): UserState {
  const { pendingImports: _queue, ...saved } = snapshotState(state)
  const cleanSettings = (settings: UserState['settings']) => ({
    ...settings,
    ...(settings.trackPreferences
      ? {
          trackPreferences: settings.trackPreferences.map((p) => ({
            ...p,
            ...Object.fromEntries(
              ['audio', 'subtitle'].flatMap((k) => {
                const track = p[k as 'audio' | 'subtitle']
                return track
                  ? [
                      [
                        k,
                        Object.fromEntries(
                          Object.entries(track).filter(
                            ([key, v]) => !(key === 'language' || key === 'title') || v !== '',
                          ),
                        ),
                      ],
                    ]
                  : []
              }),
            ),
          })),
        }
      : {}),
  })
  return {
    ...saved,
    settings: cleanSettings(saved.settings),
    profiles: saved.profiles.map((p) => ({ ...p, settings: cleanSettings(p.settings) })),
  }
}

export function mergeAccount(
  base: UserState | null,
  local: UserState,
  remote: UserState | null,
): UserState {
  if (!remote) return syncSnapshot(local)
  const l = syncSnapshot(local),
    r = syncSnapshot(normalizeState(remote))
  // On the first connection, server preferences win; local titles are retained.
  const initial = !base
    ? {
        ...l,
        settings: r.settings,
        profiles: l.profiles.map((p) => ({
          ...p,
          ...r.profiles.find((q) => q.id === p.id),
          library: p.library,
          progress: p.progress,
          collections: p.collections,
          settings: r.profiles.find((q) => q.id === p.id)?.settings ?? p.settings,
        })),
      }
    : l
  const merged = mergeValue(base ? syncSnapshot(base) : undefined, initial, r) as UserState
  if (
    merged.profiles.length > 6 ||
    merged.addons.length > 100 ||
    merged.profiles.some((p) => p.library.length > 2000)
  )
    throw Error('Synchronization limit exceeded')
  const activeProfileId = merged.profiles.some((p) => p.id === local.activeProfileId)
    ? local.activeProfileId
    : merged.profiles[0]?.id
  const profile = merged.profiles.find((p) => p.id === activeProfileId)
  if (!profile) throw Error('No synchronized profile')
  return mergePlaybackState(
    normalizeState({
      ...merged,
      activeProfileId,
      library: profile.library,
      settings: profile.settings,
      progress: profile.progress,
      deletedProgress: profile.deletedProgress,
      collections: profile.collections,
    }),
    r.profiles,
  )
}

export async function synchronizeAccount(
  local: UserState,
  baseline: UserState | null,
  token: string,
  request = api,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await request<{ version: number; state: UserState | null }>(
      '/account/sync',
      'GET',
      undefined,
      token,
    )
    const state = mergeAccount(baseline, local, remote.state)
    if (remote.state && equal(syncSnapshot(remote.state), state))
      return { state, version: remote.version }
    try {
      const saved = await request<{ version: number }>(
        '/account/sync',
        'PUT',
        { version: remote.version, state },
        token,
      )
      return { state, version: saved.version }
    } catch (error) {
      if ((error as { status?: number }).status !== 409 || attempt === 2) throw error
    }
  }
  throw Error('Synchronization conflict')
}

export function useAccountSync(
  state: UserState,
  setState: Dispatch<SetStateAction<UserState>>,
  token: string,
  account: string,
  ready: boolean,
  setVersion: Dispatch<SetStateAction<number>>,
) {
  const current = useRef(state)
  current.current = state
  const run = useRef<() => Promise<void>>(async () => {})
  const [status, setStatus] = useState({ syncing: false, error: '', lastSync: 0 })
  const trigger = useCallback(() => run.current(), [])
  useEffect(() => {
    if (!ready || !token || !account) return
    let active = true,
      busy: Promise<void> | null = null,
      baseline: UserState | null = null
    const owner = account.trim().toLowerCase()
    const loaded = readSecure('accountSync').then((raw) => {
      let saved: { account: string; state: UserState } | null = null
      try {
        saved = raw ? JSON.parse(raw) : null
      } catch {}
      if (saved?.account === owner) baseline = saved.state
    })
    const sync = () => {
      if (busy) return busy
      if (!active || !navigator.onLine) return Promise.resolve()
      busy = (async () => {
        await loaded
        if (!active) return
        setStatus((s) => ({ ...s, syncing: true, error: '' }))
        const sent = current.current
        try {
          const result = await synchronizeAccount(sent, baseline, token)
          if (!active) return
          await writeSecure('accountSync', JSON.stringify({ account: owner, state: result.state }))
          if (!active) return
          baseline = result.state
          setState((now) => {
            const next = mergeAccount(syncSnapshot(sent), now, result.state)
            next.pendingImports = now.pendingImports?.filter(
              (p) => p.account !== owner || !sent.pendingImports?.some((s) => s.id === p.id),
            )
            return equal(now, next) ? now : next
          })
          setVersion(result.version)
          setStatus({ syncing: false, error: '', lastSync: Date.now() })
        } catch (error) {
          if (active)
            setStatus((s) => ({
              ...s,
              syncing: false,
              error: error instanceof Error ? error.message : 'Synchronization unavailable',
            }))
        }
      })()
        .catch(() => {
          if (active)
            setStatus((s) => ({ ...s, syncing: false, error: 'Synchronization unavailable' }))
        })
        .finally(() => {
          busy = null
        })
      return busy
    }
    run.current = sync
    void sync()
    const visible = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void sync()
    }, 30000)
    window.addEventListener('online', sync)
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false
      run.current = async () => {}
      clearInterval(timer)
      window.removeEventListener('online', sync)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [token, account, ready, setState, setVersion])
  const changes = JSON.stringify({
    addons: state.addons,
    profiles: snapshotState(state).profiles.map(({ progress: _p, lastPlaybackAt: _t, ...p }) => p),
    pending: state.pendingImports,
  })
  useEffect(() => {
    const timer = setTimeout(() => void trigger(), 1800)
    return () => clearTimeout(timer)
  }, [changes, trigger])
  return { ...status, sync: trigger }
}
