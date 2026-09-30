import { describe, expect, it } from 'vitest'
import { isAnime, matchesCategory, createState, snapshotState, switchProfile } from './preferences'
import { redactDiagnostic } from './diagnostics'
import { parseDeepLink } from './deeplinks'
describe('Anime classification', () => {
  const animation = { id: 'tt123', name: 'Series', type: 'series', genres: ['Animation'] }
  it.each(['Japan', 'South Korea', 'China', 'JP', 'KR', 'CN', 'Japan, United States', 'Corée du Sud', 'Republic of Korea', 'Korea, Republic of', '대한민국', '한국', '中国', '中國', 'People’s Republic of China', 'CHN'])(
    'classifies animated series from %s',
    (country) => expect(isAnime({ ...animation, country })).toBe(true),
  )
  it('requires animation and origin, not the dubbing language', () => {
    expect(isAnime({ ...animation, country: 'USA', originalLanguage: 'ja' })).toBe(false)
    expect(isAnime({ ...animation, country: 'Japan', genres: ['Drama'] })).toBe(false)
    expect(isAnime({ ...animation, original_language: 'ko' })).toBe(true)
    expect(isAnime({ ...animation, country: 'France' })).toBe(false)
  })
  it('uses country arrays, production countries and localized original-language fallbacks', () => {
    for (const meta of [
      { ...animation, origin_country:['KR'] },
      { ...animation, country:['CN', 'FR'] },
      { ...animation, production_countries:[{iso_3166_1:'CN'}] },
      { ...animation, production_countries:[{name:'Republic of Korea'}] },
      { ...animation, original_language:'zh-Hans' },
      { ...animation, originalLanguage:'ko-KR' },
      { ...animation, genres:['动画'], country:'China' },
      { ...animation, genres:['애니메이션'], country:'대한민국' },
    ]) {
      expect(isAnime(meta)).toBe(true)
      expect(matchesCategory(meta, 'anime')).toBe(true)
      expect(matchesCategory(meta, 'series')).toBe(false)
    }
    expect(isAnime({...animation, country:'United States', originalLanguage:'zh-CN'})).toBe(false)
    expect(isAnime({...animation, country:'CN', genres:['Drama']})).toBe(false)
  })
  it('includes animated films from China and Korea without changing their addon resource type', () => {
    for (const country of ['KR', 'CN']) {
      const meta = { ...animation, type:'movie', country }
      expect(isAnime(meta)).toBe(true)
      expect(matchesCategory(meta, 'movie')).toBe(false)
      expect(meta.type).toBe('movie')
    }
  })
})
it('keeps collections isolated across profile switches and saves', () => {
  const a = createState()
  a.collections = [{ id: 'c', name: 'Favorites', items: ['["series","tt123"]'] }]
  a.profiles.push({ ...a.profiles[0], id: 'second', collections: [] })
  const b = switchProfile(a, 'second')
  expect(b.collections).toEqual([])
  expect(switchProfile(snapshotState(b), 'main').collections).toEqual(a.collections)
})
it('redacts JSON secrets, authorization headers, addresses and URLs', () => {
  const output = redactDiagnostic(
    'Error {"access_token":"private value", "password":"hide me"} Bearer abc\nhttps://host/path?key=123 person@example.org C:\\Users\\Person\\file',
  )
  for (const secret of [
    'private value',
    'hide me',
    'abc',
    'key=123',
    'person@example.org',
    'Person',
  ])
    expect(output).not.toContain(secret)
  expect(output).toContain('Error')
})
it('routes OAuth return links without installing an addon', () =>
  expect(parseDeepLink('primio://integrations')).toEqual({ kind: 'integrations' }))
