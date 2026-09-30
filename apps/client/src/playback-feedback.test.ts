import { describe, expect, it } from 'vitest'
import { createState } from './preferences'
import { episodeQueue, watchVideoId } from './episodes'
import { recordProgress, mergeNativeProgress, isWatched } from './progress'
import { failSavedSource, previouslyUsedSource, rememberSource } from './source-preferences'
import { resolveTheme } from './themes'
import { hsvColor, colorHsv } from './accent-picker'
import { swipeIntent } from './swipe-navigation'
import type { Meta } from './types'
import type { PrimioPlugin } from '@primio/sdk'

const series: Meta = { id: 'show', type: 'series', name: 'Show', videos: [
  { id: 's3e6', title: 'Sixth', season: 3, episode: 6 },
  { id: 's1e1', title: 'Pilot', season: 1, episode: 1 },
  { id: 's3e5', title: 'Fifth', season: 3, episode: 5 },
  { id: 's4e1', title: 'Next season', season: 4, episode: 1 },
] }

describe('Watch targets and native watched badges', () => {
  it('resumes the latest exact season, then advances through season boundaries', () => {
    let progress = recordProgress([], series, 's1e1', 20, 1200, 1)
    progress = recordProgress(progress, series, 's3e5', 600, 1200, 2)
    expect(watchVideoId(series, progress)).toBe('s3e5')
    progress = recordProgress(progress, series, 's3e5', 1200, 1200, 3)
    expect(watchVideoId(series, progress)).toBe('s3e6')
    progress = recordProgress(progress, series, 's3e6', 1200, 1200, 4)
    expect(watchVideoId(series, progress)).toBe('s4e1')
    expect(watchVideoId({ id: 'film', type: 'movie', name: 'Film' }, progress)).toBe('film')
    expect(watchVideoId({ ...series, videos: [] }, [])).toBeUndefined()
  })
  it('keeps the exact resumed episode when metadata is partial instead of falling back to season one', () => {
    const progress = recordProgress([], series, 's3e5', 600, 1200, 1)
    expect(watchVideoId({ ...series, videos: series.videos!.filter(v => v.season === 1) }, progress)).toBe('s3e5')
    expect(watchVideoId({ ...series, videos: [] }, progress)).toBe('s3e5')
    const finished = recordProgress(progress, series, 's3e5', 1200, 1200, 2)
    expect(watchVideoId({ ...series, videos: series.videos!.filter(v => v.id !== 's3e5') }, finished)).toBe('s3e6')
    expect(watchVideoId({ ...series, videos: series.videos!.filter(v => v.season === 1) }, finished)).toBe('s3e5')
  })
  it('keeps non-episodic addon types playable and resolves anime episodes', () => {
    expect(watchVideoId({ id: 'channel', type: 'tv', name: 'Channel' }, [])).toBe('channel')
    expect(watchVideoId({ id: 'anime-film', type: 'movie', category: 'anime', name: 'Film' }, [])).toBe('anime-film')
    const anime = { ...series, type: 'anime' }
    const progress = recordProgress([], anime, 's3e5', 1200, 1200, 1)
    expect(watchVideoId(anime, progress)).toBe('s3e6')
    expect(watchVideoId({ ...anime, videos: [] }, [])).toBeUndefined()
  })
  it('includes watched state and the exact current episode in the native queue', () => {
    const progress = recordProgress([], series, 's3e5', 1200, 1200, 1)
    const queue = episodeQueue(series, 's3e6', Date.now(), false, progress)
    expect(queue.episodes.find(e => e.id === 's3e5')?.watched).toBe(true)
    expect(queue.episodes.filter(e => e.current).map(e => e.id)).toEqual(['s3e6'])
  })
  it('preserves a manual unmark at the finished playhead during later progress polls', () => {
    let progress = recordProgress([], series, 's3e5', 1180, 1200, 1)
    progress = recordProgress(progress, series, 's3e5', 1180, 1200, 2, false)
    progress = recordProgress(progress, series, 's3e5', 1190, 1200, 3)
    expect(isWatched(progress[0])).toBe(false)
    progress = recordProgress(progress, series, 's3e5', 1189, 1200, 3.5)
    expect(isWatched(progress[0])).toBe(false)
    progress = recordProgress(progress, series, 's3e5', 0, 1200, 4)
    progress = recordProgress(progress, series, 's3e5', 1190, 1200, 5)
    expect(isWatched(progress[0])).toBe(true)
  })
  it('merges status edits for another episode without losing current playback position', () => {
    let state = createState()
    state.progress = recordProgress([], series, 's3e5', 600, 1200, 1)
    state = mergeNativeProgress(state, { context: { profileId: state.activeProfileId, meta: series, videoId: 's3e5' }, position: 610, duration: 1200, updatedAt: 10,
      watchedChanges: [{ videoId: 's3e6', season: 3, episode: 6, watched: true, updatedAt: 9 }],
    })
    expect(state.progress.find(p => p.videoId === 's3e5')?.position).toBe(610)
    expect(state.progress.find(p => p.videoId === 's3e6')).toMatchObject({ watched: true, season: 3, episode: 6 })
  })
})

describe('Failed source recovery', () => {
  const stream = { url: 'https://example.test/video.mp4', addonName: 'Provider', title: '1080p' }
  it('does not retry a failed remembered source, but permits an explicit new attempt', async () => {
    let settings = await rememberSource(createState().settings, series, 's3e5', stream)
    expect(await previouslyUsedSource([stream], settings, series, 's3e5')).toBe(stream)
    const failed = failSavedSource(settings, series, 's3e5', undefined, 10)
    expect(await previouslyUsedSource([stream], failed, series, 's3e5')).toBeUndefined()
    settings = await rememberSource(failed, series, 's3e5', stream)
    expect(await previouslyUsedSource([stream], settings, series, 's3e5')).toBe(stream)
  })
  it('persists a failure before duration is known and rejects another source fingerprint', async () => {
    let state = createState()
    state.settings = await rememberSource(state.settings, series, 's3e5', stream)
    const context = { profileId: state.activeProfileId, meta: series, videoId: 's3e5', sourceFingerprint: state.settings.sourcePreferences![0].fingerprint }
    state = mergeNativeProgress(state, { context: { ...context, sourceFingerprint: 'other' }, position: 0, duration: 0, updatedAt: 10, sourceFailed: true })
    expect(state.settings.sourcePreferences![0].failedAt).toBeUndefined()
    state = mergeNativeProgress(state, { context, position: 0, duration: 0, updatedAt: 11, sourceFailed: true })
    expect(state.settings.sourcePreferences![0].failedAt).toBe(11)
    expect(state.progress).toEqual([])
  })
})

describe('OLED accent and gesture direction', () => {
  const oled = { id: 'primio.oled', enabled: true, permissions: ['theme'], theme: { accent: '#FFFFFF' } } as PrimioPlugin
  it('applies a valid OLED color only to its active theme', () => {
    expect(resolveTheme([oled], '#9966EE').accent).toBe('#9966EE')
    expect(resolveTheme([oled], 'invalid').accent).toBe('#FFFFFF')
    expect(resolveTheme([{ ...oled, enabled: false }], '#9966EE').accent).not.toBe('#9966EE')
    expect(resolveTheme([{ ...oled, id: 'another-theme' }], '#9966EE').accent).toBe('#FFFFFF')
  })
  it('round trips wheel hues including neutral colors', () => {
    for (const color of ['#FF0000', '#00FF00', '#0000FF', '#9966EE', '#FFFFFF', '#000000']) {
      const { h, s, v } = colorHsv(color)
      expect(hsvColor(h, s, v)).toBe(color)
    }
  })
  it('waits for direction and tolerates normal vertical drift in a horizontal swipe', () => {
    expect(swipeIntent(4, 3)).toBe('pending')
    expect(swipeIntent(15, 14)).toBe('pending')
    expect(swipeIntent(90, 28)).toBe('horizontal')
    expect(swipeIntent(25, 90)).toBe('vertical')
  })
})
