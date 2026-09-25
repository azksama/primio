import { describe, expect, it } from 'vitest'
import { isAnime, createState, snapshotState, switchProfile } from './preferences'
import { redactDiagnostic } from './diagnostics'
import { parseDeepLink } from './deeplinks'
describe('Anime classification', () => {
  const animation = { id: 'tt123', name: 'Series', type: 'series', genres: ['Animation'] }
  it.each(['Japan', 'South Korea', 'China', 'JP', 'KR', 'CN', 'Japan, United States'])(
    'classifies animated series from %s',
    (country) => expect(isAnime({ ...animation, country })).toBe(true),
  )
  it('requires animation and origin, not the dubbing language', () => {
    expect(isAnime({ ...animation, country: 'USA', originalLanguage: 'ja' })).toBe(false)
    expect(isAnime({ ...animation, country: 'Japan', genres: ['Drama'] })).toBe(false)
    expect(isAnime({ ...animation, original_language: 'ko' })).toBe(true)
    expect(isAnime({ ...animation, country: 'France' })).toBe(false)
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
