import { describe, expect, it } from 'vitest'
import { mergePlaybackState } from './playback-sync'
import { createState } from './preferences'
import type { Progress } from './types'

describe('playback sync', () => {
  it('receives an episode on another device and preserves newer local positions and settings', () => {
    const state = createState()
    const episode: Progress = {
      id: 'series',
      type: 'series',
      name: 'Series',
      videoId: 'series:1:2',
      position: 40,
      duration: 600,
      updatedAt: 1000,
      episode: 2,
      season: 1,
      poster: '/poster.jpg',
    }
    const received = mergePlaybackState(state, [{ id: 'main', progress: [episode] }])
    expect(received.progress).toEqual([episode])
    expect(received.settings).toEqual(state.settings)
    const newer = { ...received, progress: [{ ...episode, position: 120, updatedAt: 2000 }] }
    expect(
      mergePlaybackState(newer, [{ id: 'main', progress: [episode] }]).progress[0].position,
    ).toBe(120)
    expect(
      mergePlaybackState(state, [{ id: 'another-profile', progress: [episode] }]).progress,
    ).toEqual([])
  })
})


it('propagates history deletions and permits a later intentional replay', async () => {
  const { removeProgress } = await import('./progress-deletions')
  const { snapshotState, switchProfile } = await import('./preferences')
  const state = createState()
  const entry: Progress = { id: 'film', type: 'movie', videoId: 'film', name: 'Film', position: 20, duration: 90, updatedAt: 100 }
  state.progress = [entry]
  state.profiles.push({ ...state.profiles[0], id: 'other', progress: [entry] })
  const deleted = removeProgress(state, entry, 200)
  const merged = mergePlaybackState(deleted, [{ id: 'main', progress: [entry] }])
  expect(merged.progress).toEqual([])
  expect(switchProfile(snapshotState(merged), 'other').progress).toEqual([entry])
  const secondDevice = mergePlaybackState(state, snapshotState(deleted).profiles)
  expect(secondDevice.progress).toEqual([])
  expect(mergePlaybackState(secondDevice, [{ id: 'main', progress: [{ ...entry, updatedAt: 300 }] }]).progress).toHaveLength(1)
})
