import { describe, expect, it } from 'vitest'
import { createIntroSkipper, type JsonFetcher } from '@primio/intro-skipper'

const options = { aniSkip: true, skipIntro: false }
const intervals = { found: true, results: [{ interval: { startTime: 30, endTime: 120 }, skipType: 'op', episodeLength: 1440 }] }
const mapping = { data: [{ attributes: { externalSite: 'myanimelist/anime', externalId: '58811' } }] }
const anime = { id: 'tt987', type: 'series', category: 'anime' as const, name: 'Tougen Anki: Dark Demon of Paradise', releaseInfo: '2025' }
const candidate = { id: '48834', attributes: { canonicalTitle: 'Tougen Anki', titles: { en_jp: 'Tougen Anki' },
  abbreviatedTitles: ['Tougen Anki: Dark Demon of Paradise'], startDate: '2025-07-11' } }

describe('AniSkip identity resolution', () => {
  it('resolves a unique documented alias to Kitsu and MAL, retaining the requested episode', async () => {
    const urls: string[] = []
    const fetcher: JsonFetcher = async <T>(url: string) => {
      urls.push(url)
      return (url.includes('filter[text]') ? { data: [candidate] } : url.includes('/mappings') ? mapping : intervals) as T
    }
    const result = await createIntroSkipper(fetcher).resolve(anime, 'tt987:1:7', options)
    expect(urls.at(-1)).toContain('/58811/7?')
    expect(result[0]).toMatchObject({ kind: 'intro', start: 30, end: 120 })
  })
  it('refuses ambiguous, approximate and wrong-year title matches', async () => {
    for (const candidates of [[candidate, { ...candidate, id: '999' }],
      [{ ...candidate, attributes: { ...candidate.attributes, abbreviatedTitles: [] } }],
      [{ ...candidate, attributes: { ...candidate.attributes, startDate: '2024-01-01' } }]]) {
      const urls: string[] = []
      const fetcher: JsonFetcher = async <T>(url: string) => { urls.push(url); return { data: candidates } as T }
      expect(await createIntroSkipper(fetcher).resolve(anime, 'tt987:1:1', options)).toEqual([])
      expect(urls).toHaveLength(1)
    }
  })
  it('does not apply the first season mapping to a later season or an ordinary series', async () => {
    const urls: string[] = []
    const fetcher: JsonFetcher = async <T>(url: string) => { urls.push(url); return {} as T }
    const skipper = createIntroSkipper(fetcher)
    expect(await skipper.resolve(anime, 'tt987:2:1', options)).toEqual([])
    expect(await skipper.resolve({ id: 'tt987', type: 'series', name: 'Tougen Anki' }, 'tt987:1:1', options)).toEqual([])
    expect(urls).toEqual([])
  })
  it('maps AniList by identity and shares concurrent requests', async () => {
    const urls: string[] = []
    const fetcher: JsonFetcher = async <T>(url: string) => {
      urls.push(url)
      await new Promise(resolve => setTimeout(resolve, 1))
      return (url.includes('filter[externalSite]') ? { data: [{ relationships: { item: { data: { id: '48834', type: 'anime' } } } }] }
        : url.includes('/mappings') ? mapping : intervals) as T
    }
    const skipper = createIntroSkipper(fetcher), meta = { id: 'anilist:177474', type: 'anime' }
    const result = await Promise.all([skipper.resolve(meta, 'anilist:177474:1', options), skipper.resolve(meta, 'anilist:177474:1', options)])
    expect(result[0]).toEqual(result[1])
    expect(urls).toHaveLength(3)
    expect(urls.at(-1)).toContain('/58811/1?')
  })
  it('retains IntroDB fallback when AniSkip has no data or fails', async () => {
    for (const fails of [false, true]) {
      const urls: string[] = []
      const fetcher: JsonFetcher = async <T>(url: string) => {
        urls.push(url)
        if (url.includes('aniskip')) {
          if (fails) throw Error('No segments')
          return { found: false, results: [] } as T
        }
        return { intro: { start_sec: 10, end_sec: 90 } } as T
      }
      const result = await createIntroSkipper(fetcher).resolve({ ...anime, malId: 58811 }, 'tt987:1:2', { aniSkip: true, skipIntro: true })
      expect(result).toEqual([{ start: 10, end: 90, kind: 'intro', label: 'Passer l’intro', provider: 'IntroDB' }])
      expect(urls).toHaveLength(2)
      expect(urls[1]).toContain('introdb')
    }
  })
})
