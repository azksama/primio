import { describe, it, expect } from 'vitest'
import { createState, switchProfile, snapshotState } from './preferences'
import { recordProgress, resumePosition, isWatched, mergeNativeProgress, findProgress } from './progress'
const movie = { id: 'tt1', type: 'movie', name: 'Film' }
describe('playback history', () => {
  const series = { id: 'show', type: 'series', name: 'Show', videos: [
    { id: 'special', title: 'Special', season: 0, episode: 1 },
    { id: 'one', title: 'One', season: 1, episode: 1 },
    { id: 'two', title: 'Two', season: 1, episode: 2 },
    { id: 'three', title: 'Three', season: 2, episode: 1 },
    { id: 'four', title: 'Four', season: 2, episode: 2 },
  ] }
  it('marks earlier regular episodes only after passing 50 percent', () => {
    const half = recordProgress([], series, 'three', 50, 100, 1)
    expect(half).toHaveLength(1)
    const passed = recordProgress(half, series, 'three', 51, 100, 2)
    expect(isWatched(findProgress(passed, 'series', 'one'))).toBe(true)
    expect(isWatched(findProgress(passed, 'series', 'two'))).toBe(true)
    expect(isWatched(findProgress(passed, 'series', 'three'))).toBe(false)
    expect(findProgress(passed, 'series', 'four')).toBeUndefined()
    expect(findProgress(passed, 'series', 'special')).toBeUndefined()
  })
  it('preserves measured positions and later manual unwatched choices', () => {
    let items = recordProgress([], series, 'one', 20, 100, 1)
    items = recordProgress(items, series, 'three', 60, 100, 2)
    expect(findProgress(items, 'series', 'one')).toMatchObject({ position: 20, duration: 100, watched: true })
    items = recordProgress(items, series, 'one', 20, 100, 3, false)
    items = recordProgress(items, series, 'three', 61, 100, 4)
    expect(isWatched(findProgress(items, 'series', 'one'))).toBe(false)
  })
  it('applies inference to the native session profile and honors history deletions', () => {
    const state = createState()
    state.deletedProgress = [{ type: 'series', videoId: 'one', updatedAt: 30 }]
    const result = mergeNativeProgress(state, { context: { profileId: 'main', meta: series, videoId: 'three' }, position: 60, duration: 100, updatedAt: 20 })
    expect(findProgress(result.progress, 'series', 'one')).toBeUndefined()
    expect(isWatched(findProgress(result.progress, 'series', 'two'))).toBe(true)
  })
  it('retains episode artwork and numbering after a restart or source change', () => {
    const meta = {
      id: 'series',
      type: 'series',
      name: 'Series',
      videos: [
        { id: 's1e1', title: 'First', episode: 1, season: 1 },
        {
          id: 's2e3',
          title: 'Third',
          episode: 3,
          season: 2,
          thumbnail: 'https://example.org/episode.jpg',
        },
      ],
    }
    let items = recordProgress([], meta, 's2e3', 42, 1400, 1)
    items = JSON.parse(JSON.stringify(items))
    items = recordProgress(
      items,
      { id: 'series', type: 'series', name: 'Series' },
      's2e3',
      60,
      1400,
      2,
    )
    expect(items[0]).toMatchObject({
      episode: 3,
      season: 2,
      seasonCount: 2,
      episodeThumbnail: 'https://example.org/episode.jpg',
      position: 60,
    })
    const next = recordProgress(items, meta, 's1e1', 30, 1400, 3)
    expect(next[0].episode).toBe(1)
    expect(next[0].episodeThumbnail).toBeUndefined()
  })

  it('resumes by content identity and isolates different types and episodes', () => {
    let items = recordProgress([], movie, 'tt1', 135, 7200, 1)
    items = recordProgress(items, { ...movie, type: 'series' }, 'tt1', 45, 3600, 2)
    items = recordProgress(items, { ...movie, type: 'series' }, 'tt1:1:2', 90, 3600, 3)
    expect(resumePosition(items, 'movie', 'tt1')).toBe(135)
    expect(resumePosition(items, 'series', 'tt1')).toBe(45)
    expect(resumePosition(items, 'series', 'tt1:1:3')).toBe(0)
  })
  it('preserves valid history across opening, unavailable duration and stale events', () => {
    const items = recordProgress([], movie, 'tt1', 135, 7200, 10)
    expect(recordProgress(items, movie, 'tt1', 0, 0, 11)).toBe(items)
    expect(recordProgress(items, movie, 'tt1', NaN, 7200, 12)).toBe(items)
    expect(recordProgress(items, movie, 'tt1', 60, 7200, 9)).toBe(items)
  })
  it('marks completion, restarts completed media, and supports marking unwatched', () => {
    let items = recordProgress([], movie, 'tt1', 96, 100, 1)
    expect(isWatched(items[0])).toBe(true)
    expect(resumePosition(items, 'movie', 'tt1')).toBe(0)
    items = recordProgress(items, movie, 'tt1', 0, 100, 2, false)
    expect(isWatched(items[0])).toBe(false)
  })
  it('recovers the native journal after restart and does not restore removed history twice', () => {
    const state = createState()
    const event = {
      context: { profileId: state.activeProfileId, meta: movie, videoId: 'tt1' },
      position: 71,
      duration: 200,
      updatedAt: 1234,
    }
    const restored = mergeNativeProgress(state, event)
    expect(restored.progress[0].position).toBe(71)
    const restarted = JSON.parse(JSON.stringify(snapshotState({ ...restored, progress: [] })))
    expect(mergeNativeProgress(restarted, event)).toBe(restarted)
  })
  it('routes delayed native progress to the profile that started playback', () => {
    let state = createState()
    const first = state.activeProfileId
    state.profiles.push({ ...state.profiles[0], id: 'second', name: 'Second' })
    state = switchProfile(state, 'second')
    state = mergeNativeProgress(state, {
      context: { profileId: first, meta: movie, videoId: 'tt1' },
      position: 71,
      duration: 200,
      updatedAt: 1234,
    })
    expect(state.progress).toHaveLength(0)
    expect(switchProfile(state, first).progress[0].position).toBe(71)
  })
})
