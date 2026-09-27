import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { api, writeSecure } from './platform'
import { snapshotState } from './preferences'
import type { UserState } from './types'

export interface PendingImport {
  id: string
  account: string
  profileId: string
  library: UserState['library']
  addons: UserState['addons']
}

// Apply only the imported additions to the latest server state. Local settings or
// stale libraries must never replace changes made on another device.
export function mergeRemoteImport(local: UserState, remote: UserState | null, batch: PendingImport) {
  const { pendingImports: _pending, ...base } = snapshotState(remote ?? local)
  const profile = base.profiles.find(p => p.id === batch.profileId)
    ?? snapshotState(local).profiles.find(p => p.id === batch.profileId)
  if (!profile) throw Error('Import profile no longer exists')
  const library = [...new Map([...batch.library, ...profile.library]
    .map(item => [JSON.stringify([item.type, item.id]), item])).values()]
  const addons = [...new Map([...batch.addons, ...base.addons].map(addon => [addon.url, addon])).values()]
  if (library.length > 2000 || addons.length > 100) throw Error('Import limit exceeded')
  const exists = base.profiles.some(p => p.id === profile.id)
  if (!exists && base.profiles.length >= 6) throw Error('Profile limit exceeded')
  const imported = { ...profile, library }
  if (!exists && base.profiles.some(p => p.avatar === imported.avatar)) {
    imported.avatar = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, '0'))
      .find(avatar => base.profiles.every(p => p.avatar !== avatar))
  }
  const profiles = exists
    ? base.profiles.map(p => p.id === profile.id ? imported : p)
    : [...base.profiles, imported]
  return { ...base, addons, profiles, library: base.activeProfileId === profile.id ? library : base.library }
}

type Request = typeof api
export async function uploadImport(local: UserState, batch: PendingImport, token: string, request: Request = api) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await request<{ version: number; state: UserState | null }>('/account/sync', 'GET', undefined, token)
    const state = mergeRemoteImport(local, remote.state, batch)
    if (remote.state && JSON.stringify(state) === JSON.stringify(snapshotState(remote.state)))
      return { previousVersion: remote.version, version: remote.version }
    try {
      const saved = await request<{ version: number }>('/account/sync', 'PUT', { version: remote.version, state }, token)
      return { previousVersion: remote.version, version: saved.version }
    } catch (error) {
      if ((error as { status?: number }).status !== 409 || attempt === 2) throw error
    }
  }
  throw Error('Import synchronization conflict')
}

export function useImportSync(
  state: UserState,
  setState: Dispatch<SetStateAction<UserState>>,
  token: string,
  account: string,
  ready: boolean,
  setVersion: Dispatch<SetStateAction<number>>,
) {
  const current = useRef(state)
  current.current = state
  const flight = useRef<Promise<void> | null>(null)
  const [syncing, setSyncing] = useState(false)
  const owner = account.trim().toLowerCase()
  const queueKey = (state.pendingImports ?? []).filter(batch => batch.account === owner).map(batch => batch.id).join(',')
  useEffect(() => {
    if (!ready || !token || !owner || !queueKey) return
    let active = true
    const synchronize = async () => {
      if (flight.current) await flight.current
      if (!active || flight.current || !navigator.onLine) return
      const batch = current.current.pendingImports?.find(item => item.account === owner)
      if (!batch) return
      setSyncing(true)
      const task = (async () => {
        try {
          // Persist the queue before networking so a restart can retry safely.
          await writeSecure('state', JSON.stringify(snapshotState(current.current)))
          const result = await uploadImport(current.current, batch, token)
          if (!active) return
          setState(s => ({ ...s, pendingImports: s.pendingImports?.filter(item => item.id !== batch.id) }))
          // A newer remote library still requires the existing conflict resolution
          // before a later full-state upload can replace it.
          setVersion(version => version === result.previousVersion ? result.version : version)
        } catch {
          // Keep the import locally and retry on reconnect, focus or the timer.
        } finally {
          if (active) setSyncing(false)
        }
      })()
      flight.current = task
      await task
      if (flight.current === task) flight.current = null
    }
    void synchronize()
    const timer = window.setInterval(synchronize, 30000)
    window.addEventListener('online', synchronize)
    window.addEventListener('focus', synchronize)
    return () => {
      active = false
      setSyncing(false)
      window.clearInterval(timer)
      window.removeEventListener('online', synchronize)
      window.removeEventListener('focus', synchronize)
    }
  }, [token, owner, ready, queueKey, setState, setVersion])
  return { syncing, pending: !!queueKey }
}
