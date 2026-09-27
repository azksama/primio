import { describe, expect, it, vi } from 'vitest'
import { mergeRemoteImport, uploadImport, type PendingImport } from './import-sync'
import { createState, snapshotState } from './preferences'
import type { api } from './platform'

const batch: PendingImport = {
  id: 'import-1', account: 'viewer@example.org', profileId: 'main',
  library: [{ id: 'ttimport', type: 'movie', name: 'Imported' }],
  addons: [{ url: 'https://import.example/manifest.json', enabled: true }],
}
describe('Automatic import synchronization', () => {
  it('merges additions without overwriting newer cloud libraries, settings or addon choices', () => {
    const local = createState(), remote = createState()
    local.library = [{ id: 'stale', type: 'movie', name: 'Removed on another device' }]
    remote.library = [{ id: 'cloud', type: 'movie', name: 'Added on another device' }]
    remote.settings.uiLanguage = 'ja'
    remote.addons = [{ ...batch.addons[0], enabled: false }]
    const merged = mergeRemoteImport(local, remote, batch)
    expect(merged.library.map(item => item.id)).toEqual(['ttimport', 'cloud'])
    expect(merged.profiles[0].library).toEqual(merged.library)
    expect(merged.settings.uiLanguage).toBe('ja')
    expect(merged.addons[0].enabled).toBe(false)
    expect(mergeRemoteImport(local, merged, batch)).toEqual(merged)
  })
  it('keeps imports scoped to their original profile after switching profiles', () => {
    const local = createState(), remote = snapshotState(createState())
    remote.profiles.push({ ...remote.profiles[0], id: 'other', avatar: '02', library: [] })
    const merged = mergeRemoteImport(local, remote, { ...batch, profileId: 'other' })
    expect(merged.library).toEqual([])
    expect(merged.profiles[0].library).toEqual([])
    expect(merged.profiles[1].library).toEqual(batch.library)
  })
  it('initializes an empty cloud account without losing existing local titles or exporting its queue', () => {
    const local = createState()
    local.library = [{ id: 'existing', type: 'movie', name: 'Existing' }]
    local.pendingImports = [batch]
    const restored = JSON.parse(JSON.stringify(snapshotState(local)))
    const merged = mergeRemoteImport(restored, null, batch)
    expect(restored.pendingImports).toEqual([batch])
    expect(merged.library.map(item => item.id)).toEqual(['ttimport', 'existing'])
    expect(merged).not.toHaveProperty('pendingImports')
  })
  it('refetches after a concurrent edit instead of uploading a stale snapshot', async () => {
    const latest = createState()
    latest.library = [{ id: 'concurrent', type: 'movie', name: 'Concurrent addition' }]
    const request = vi.fn()
      .mockResolvedValueOnce({ version: 1, state: createState() })
      .mockRejectedValueOnce({ status: 409 })
      .mockResolvedValueOnce({ version: 2, state: latest })
      .mockResolvedValueOnce({ version: 3 })
    await expect(uploadImport(createState(), batch, 'token', request as typeof api))
      .resolves.toEqual({ previousVersion: 2, version: 3 })
    expect(request.mock.calls[3][2].state.library.map((item: { id: string }) => item.id))
      .toEqual(['ttimport', 'concurrent'])
  })
  it('does not duplicate a completed upload when the acknowledgement was lost', async () => {
    const remote = mergeRemoteImport(createState(), createState(), batch)
    const request = vi.fn().mockResolvedValue({ version: 5, state: remote })
    await expect(uploadImport(createState(), batch, 'token', request as typeof api))
      .resolves.toEqual({ previousVersion: 5, version: 5 })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('leaves the persisted batch intact when the network request fails', async () => {
    const local = createState()
    local.pendingImports = [batch]
    const request = vi.fn().mockRejectedValue(Error('Offline'))
    await expect(uploadImport(local, batch, 'token', request as typeof api)).rejects.toThrow('Offline')
    expect(local.pendingImports).toEqual([batch])
  })
})
