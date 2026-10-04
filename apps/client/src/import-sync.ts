import { api } from './platform'
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
