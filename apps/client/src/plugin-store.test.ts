import { describe, it, expect } from 'vitest'
import { pluginSchema, rankSources } from '@primio/sdk'
import { storePlugins, installPlugin } from './plugin-store'
import { viewingStatus } from './library-status'
import { defaults } from './preferences'
describe('plugin store and tracking', () => {
  it('ships valid unique manifests and switches themes without deleting them', () => {
    expect(new Set(storePlugins.map((p) => p.id)).size).toBe(storePlugins.length)
    storePlugins.forEach((p) => expect(pluginSchema.safeParse(p).success).toBe(true))
    const installed = installPlugin([storePlugins[0]], storePlugins[1])
    expect(installed[0].enabled).toBe(false)
    expect(installed[1].enabled).toBe(true)
  })
  it('disabled source filters do not hide streams', () => {
    const p = storePlugins.find((p) => p.sources)!
    expect(rankSources([{ title: 'CAM' }], [{ ...p, enabled: false }])).toHaveLength(1)
  })
  it('does not complete a series with unwatched or future episodes', () => {
    const m = {
      id: 'show',
      type: 'series',
      name: 'Show',
      videos: [
        { id: 'e1', title: '1', episode: 1 },
        { id: 'e2', title: '2', episode: 2 },
      ],
    }
    const history = [{ ...m, videoId: 'e1', position: 99, duration: 100, updatedAt: 1 }]
    expect(viewingStatus(m, history, defaults)).toBe('watching')
    expect(viewingStatus(m, [...history, { ...history[0], videoId: 'e2' }], defaults)).toBe(
      'completed',
    )
    expect(viewingStatus(m, [], defaults)).toBe('planned')
  })
})
