import { describe, expect, it } from 'vitest'
import { mergeAccount, mergeValue, synchronizeAccount } from './account-sync'
import { createState, snapshotState } from './preferences'

describe('automatic account synchronization', () => {
  it('merges independent edits and keeps library deletions across devices', () => {
    const base = createState()
    base.library = [
      { id: 'a', type: 'movie', name: 'A' },
      { id: 'b', type: 'movie', name: 'B' },
    ]
    const local = structuredClone(base),
      remote = structuredClone(base)
    local.library = local.library.filter((x) => x.id !== 'a')
    remote.library.push({ id: 'c', type: 'movie', name: 'C' })
    local.settings.audioLanguage = 'jpn'
    remote.settings.subtitleLanguage = 'fra'
    const result = mergeAccount(snapshotState(base), local, snapshotState(remote))
    expect(result.library.map((x) => x.id)).toEqual(['b', 'c'])
    expect(result.settings.audioLanguage).toBe('jpn')
    expect(result.settings.subtitleLanguage).toBe('fra')
  })
  it('does not switch the active profile to another device selection', () => {
    const local = createState()
    local.profiles.push({ ...local.profiles[0], id: 'second', name: 'Second', avatar: '02' })
    local.activeProfileId = 'second'
    const remote = structuredClone(local)
    remote.activeProfileId = 'main'
    expect(mergeAccount(snapshotState(local), local, snapshotState(remote)).activeProfileId).toBe(
      'second',
    )
  })
  it('preserves newer playback and does not upload the pending-import queue', () => {
    const local = createState(),
      remote = createState()
    local.progress = [
      {
        id: 'a',
        type: 'movie',
        name: 'A',
        videoId: 'a',
        position: 10,
        duration: 100,
        updatedAt: 1,
      },
    ]
    remote.progress = [{ ...local.progress[0], position: 50, updatedAt: 2 }]
    expect(mergeAccount(null, local, snapshotState(remote)).progress[0].position).toBe(50)
    expect(mergeAccount(null, local, remote).pendingImports).toBeUndefined()
  })
  it('retries an optimistic conflict against the new server version', async () => {
    const local = createState()
    local.library = [{ id: 'a', type: 'movie', name: 'A' }]
    let puts = 0,
      gets = 0
    const result = await synchronizeAccount(
      local,
      null,
      'token',
      async <T>(_path: string, method = 'GET') => {
        if (method === 'GET') return { version: ++gets, state: null } as T
        if (++puts === 1) throw Object.assign(Error('conflict'), { status: 409 })
        return { version: 3 } as T
      },
    )
    expect(result.version).toBe(3)
    expect(puts).toBe(2)
  })
  it('keeps edits made while a request is in flight', () => {
    expect(
      mergeValue(
        { name: 'before', setting: 1 },
        { name: 'during', setting: 1 },
        { name: 'before', setting: 2 },
      ),
    ).toEqual({ name: 'during', setting: 2 })
  })
})

it('merges concurrent collection membership changes and removals', () => {
  expect(mergeValue(['a', 'b'], ['a', 'c'], ['a', 'b', 'd'])).toEqual(['a', 'c', 'd'])
})
