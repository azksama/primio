import { describe, it, expect } from 'vitest'
import {
  createState,
  normalizeState,
  snapshotState,
  switchProfile,
  durationLabel,
  matchesCategory,
  seasons,
} from './preferences'
import { parseDeepLink } from './deeplinks'
import { createIntroSkipper, validSegments, type JsonFetcher } from '@primio/intro-skipper'
describe('Profile migration and isolation', () => {
  it('preserves old libraries and maps independent language defaults', () => {
    const old = {
      library: [{ id: 'tt1', type: 'movie', name: 'Film' }],
      settings: { language: 'jpn', player: 'internal', subtitles: true, reduceMotion: false },
    }
    const migrated = normalizeState(old as Parameters<typeof normalizeState>[0])
    expect(migrated.library).toEqual(old.library)
    expect(migrated.profiles[0].library).toEqual(old.library)
    expect(migrated.settings.audioLanguage).toBe('jpn')
    expect(migrated.settings.subtitleLanguage).toBe('jpn')
  })
  it('switches libraries and languages without leaking preferences across profiles', () => {
    let state = createState()
    state.library = [{ id: 'first', type: 'movie', name: 'First' }]
    state.profiles.push({
      ...state.profiles[0],
      id: 'second',
      name: 'Second',
      library: [],
      settings: { ...state.settings, audioLanguage: 'eng' },
    })
    state = switchProfile(state, 'second')
    expect(state.library).toEqual([])
    expect(state.settings.audioLanguage).toBe('eng')
    state.library = [{ id: 'second', type: 'series', name: 'Second' }]
    state = switchProfile(state, 'main')
    expect(state.library[0].id).toBe('first')
    expect(snapshotState(state).profiles[1].library[0].id).toBe('second')
  })
  it('formats hours in base 60 and preserves anime classification', () => {
    expect(durationLabel(6000)).toBe('1h40')
    expect(durationLabel(3600)).toBe('1h00')
    expect(durationLabel(59)).toBe('1 min')
    expect(matchesCategory({ id: 'kitsu:1', type: 'series', name: 'Anime' }, 'anime')).toBe(true)
    expect(matchesCategory({ id: 'kitsu:1', type: 'series', name: 'Anime' }, 'series')).toBe(false)
    expect(
      seasons({
        id: 'x',
        type: 'series',
        name: 'x',
        videos: [
          { id: '3', title: 'x', season: 2 },
          { id: '1', title: 'x', season: 0 },
          { id: '2', title: 'x', season: 1 },
        ],
      }),
    ).toEqual([0, 1, 2])
  })
})
describe('Deep link contracts', () => {
  it('opens Stremio and Primio addon previews, preserving configuration paths', () => {
    expect(parseDeepLink('stremio://example.org/config/manifest.json')).toEqual({
      kind: 'addon',
      url: 'https://example.org/config/manifest.json',
    })
    expect(parseDeepLink('primio://addon?url=https%3A%2F%2Fexample.org%2Fmanifest.json').kind).toBe(
      'addon',
    )
    expect(parseDeepLink('primio://detail/series/tt123')).toEqual({
      kind: 'meta',
      type: 'series',
      id: 'tt123',
    })
  })
  it('rejects unsupported schemes and embedded credentials', () => {
    for (const input of [
      'javascript:alert(1)',
      'primio://addon?url=file:///tmp/video',
      'stremio://user:secret@example.org/manifest.json',
      'primio://detail/unknown/title',
    ])
      expect(() => parseDeepLink(input)).toThrow()
  })
})
describe('Primio Intro Skipper', () => {
  it('maps Kitsu by ID and consumes AniSkip intervals without guessing titles', async () => {
    const urls: string[] = []
    const fetcher: JsonFetcher = async <T>(url: string) => {
      urls.push(url)
      return (
        url.includes('mappings')
          ? { data: [{ attributes: { externalSite: 'myanimelist/anime', externalId: '1' } }] }
          : {
              results: [
                { interval: { startTime: 57, endTime: 145 }, skipType: 'op', episodeLength: 1491 },
              ],
            }
      ) as T
    }
    const plugin = createIntroSkipper(fetcher)
    const result = await plugin.resolve({ id: 'kitsu:1', type: 'anime' }, 'kitsu:1:1', {
      aniSkip: true,
      skipIntro: true,
    })
    expect(urls[1]).toContain('/1/1?')
    expect(result[0]).toMatchObject({ start: 57, end: 145, kind: 'intro', provider: 'AniSkip' })
    await plugin.resolve({ id: 'kitsu:1', type: 'anime' }, 'kitsu:1:1', {
      aniSkip: true,
      skipIntro: true,
    })
    expect(urls).toHaveLength(2)
  })
  it('isolates provider failure and rejects malformed intervals', async () => {
    const plugin = createIntroSkipper(async () => {
      throw Error('Offline')
    })
    expect(
      await plugin.resolve({ id: 'tt123', type: 'series' }, 'tt123:1:2', {
        aniSkip: true,
        skipIntro: true,
      }),
    ).toEqual([])
    expect(
      validSegments([
        { start: 10, end: 2, label: 'Bad', kind: 'intro', provider: 'test' },
        { start: -1, end: 20, label: 'Bad', kind: 'intro', provider: 'test' },
      ]),
    ).toEqual([])
  })
})
