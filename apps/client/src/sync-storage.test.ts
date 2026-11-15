import { describe, expect, it } from 'vitest'
import { createState, snapshotState } from './preferences'
import { mergeAccount } from './account-sync'
import { persistAccountSync } from './sync-storage'

describe('durable synchronization', () => {
  it('preserves a received addon after interruption between snapshot and baseline', async () => {
    const previous = snapshotState(createState())
    const next = { ...previous, addons: [...previous.addons, { url: 'https://qa.example/manifest.json', enabled: true }] }
    const disk = new Map([['state', JSON.stringify(previous)], ['accountSync', JSON.stringify({ account: 'qa', state: previous })]])
    await expect(persistAccountSync('qa', next, next, () => true, async (key, value) => {
      if (key === 'accountSync') throw Error('Interrupted')
      disk.set(key, value)
    })).rejects.toThrow('Interrupted')
    const restored = mergeAccount(JSON.parse(disk.get('accountSync')!).state, JSON.parse(disk.get('state')!), next)
    expect(restored.addons).toEqual(next.addons)
  })

  it('never advances the baseline if local persistence fails', async () => {
    const state = createState(), writes: string[] = []
    await expect(persistAccountSync('qa', state, state, () => true, async (key) => {
      writes.push(key)
      throw Error('Storage unavailable')
    })).rejects.toThrow('Storage unavailable')
    expect(writes).toEqual(['state'])
  })

  it('does not restore a baseline after logout during local persistence', async () => {
    const state = createState(), writes: string[] = []
    let active = true
    expect(await persistAccountSync('qa', state, state, () => active, async (key) => {
      writes.push(key)
      active = false
    })).toBe(false)
    expect(writes).toEqual(['state'])
  })
})
