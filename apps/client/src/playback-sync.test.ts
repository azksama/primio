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
