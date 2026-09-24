import { afterEach, describe, expect, it } from 'vitest'
import { correctAnimeDates } from './anime-dates'
import { episodeQueue, playbackTitle } from './episodes'
import { audioPreference, createState } from './preferences'
import { equivalentSources, rememberSource } from './source-preferences'
import { sourceLanguages } from './sources'
import { setLocale } from './i18n'
import type { Meta, Stream } from './types'

afterEach(() => setLocale('en'))
const anime: Meta = {
  id: 'kitsu:50743',
  type: 'series',
  category: 'anime',
  name: 'Temppal',
  videos: [1, 2, 3, 4].map((episode) => ({
    id: 'ep' + episode,
    title: 'Episode ' + episode,
    episode,
    season: 1,
    released: '2026-09-20T00:00:00Z',
  })),
}
describe('Episode dates and playback preferences', () => {
  it('estimates missing anime dates weekly, labels them unconfirmed and keeps official dates', () => {
    const result = correctAnimeDates(
      anime,
      new Map([[3, '2026-10-06T00:00:00Z']]),
    )
    expect(result.videos?.map((v) => v.released?.slice(0, 10))).toEqual([
      '2026-09-20',
      '2026-09-27',
      '2026-10-06',
      '2026-10-11',
    ])
    expect(result.videos?.map((v) => !!v.releaseUnconfirmed)).toEqual([false, true, false, true])
    expect(episodeQueue(result, 'ep1', Date.parse('2026-10-30')).nextVideoId).toBe('ep3')
  })
  it('does not invent a premiere date or shift an official schedule', () => {
    const unknown = {
      ...anime,
      videos: [
        { id: 'ep1', title: 'First', episode: 1 },
        { id: 'ep2', title: 'Second', episode: 2 },
      ],
    }
    expect(
      correctAnimeDates(unknown, new Map()).videos?.every(
        (v) => !v.released && v.releaseUnconfirmed,
      ),
    ).toBe(true)
    const dated = {
      ...anime,
      videos: anime.videos?.map((v, i) => ({
        ...v,
        released: `2026-10-${String(10 + i * 2).padStart(2, '0')}`,
      })),
    }
    expect(correctAnimeDates(dated, new Map())).toEqual(dated)
  })
  it('includes seasons only for multi-season series and leaves movie titles intact', () => {
    setLocale('fr')
    expect(playbackTitle(anime, 'ep2')).toBe('Temppal - Épisode 2')
    expect(
      playbackTitle(
        {
          ...anime,
          videos: [...anime.videos!, { id: 's2', title: 'Season 2', episode: 1, season: 2 }],
        },
        'ep2',
      ),
    ).toBe('Temppal - Épisode 2 (Saison 1)')
    expect(playbackTitle({ ...anime, type: 'movie' }, 'ep2')).toBe('Temppal')
  })
  it('honors per-type original audio and inherits the general preference', () => {
    const settings = {
      ...createState().settings,
      audioLanguage: 'fra',
      audioByType: { anime: 'original', movie: 'eng', series: 'inherit' },
    }
    expect(audioPreference(settings, { ...anime, originalLanguage: 'jpn' })).toBe('jpn')
    expect(audioPreference(settings, { ...anime, category: undefined, id: 'tt1' })).toBe('fra')
    expect(audioPreference(settings, { id: 'tt2', type: 'movie', name: 'Film' })).toBe('eng')
  })
  it('remembers source characteristics without storing expiring media URLs', () => {
    const old: Stream = {
      url: 'https://example.org/old?token=secret',
      addonKey: 'https://addon.example/manifest.json',
      name: '1080p WEB-DL',
      audioLanguages: ['ja'],
      subtitleLanguages: ['fr'],
    }
    const settings = rememberSource(createState().settings, anime, 'ep1', old)
    expect(JSON.stringify(settings.sourcePreferences)).not.toContain('secret')
    const other = { ...old, url: 'https://example.org/new', addonKey: 'another' },
      low = { ...old, name: '720p WEBRip' },
      equivalent = { ...old, url: 'https://example.org/ep2' }
    expect(equivalentSources([other, low, equivalent], settings, anime).equivalent).toBe(equivalent)
    expect(equivalentSources([other, low], settings, anime).equivalent).toBeUndefined()
  })
  it('separates audio languages from subtitle labels and VOSTFR', () => {
    expect(
      sourceLanguages({ name: '1080p VOSTFR', title: 'Audio: 🇯🇵 Japanese\nSubtitles: 🇫🇷 French' }),
    ).toEqual({ audio: ['jpn'], subtitles: ['fra'] })
  })
})
