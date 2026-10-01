import { afterEach, expect, it } from 'vitest'
import { canonicalGenre, genreLabel } from './genres'
import { appLanguages, setLocale, t } from './i18n'
import { matchesDiscovery } from './discovery'
import { isAnime } from './preferences'

afterEach(() => setLocale('en'))
it('localizes provider genres and surprise picks in every application language', () => {
  const expected = ['Adventure', 'Aventure', 'Abenteuer', 'Aventura', 'Aventura', 'アドベンチャー', '冒险', '冒險']
  appLanguages.forEach(([language], index) => {
    setLocale(language)
    expect(genreLabel('Adventure')).toBe(expected[index])
    expect(genreLabel('An unrecognized provider genre')).toBe('An unrecognized provider genre')
    expect(t('Surprenez-moi')).not.toBe(language === 'en' ? 'Surprenez-moi' : 'Surprise me')
    expect(t('Une autre idée')).not.toBe(language === 'en' ? 'Une autre idée' : 'Another idea')
  })
})
it('matches translated genres without changing provider filter values or category', () => {
  expect(canonicalGenre('Sci-Fi')).toBe('Science Fiction')
  expect(canonicalGenre('Comedia')).toBe('Comedy')
  expect(matchesDiscovery({ id: '1', name: 'One', type: 'movie', genres: ['Comedy'] }, { genre: 'Comédie' })).toBe(true)
  expect(matchesDiscovery({ id: '1', name: 'One', type: 'movie', genres: ['Drama'] }, { genre: 'Comédie' })).toBe(false)
  expect(isAnime({ id: '1', type: 'series', country: 'JP', genres: ['Animación'] })).toBe(true)
  expect(isAnime({ id: '1', type: 'series', country: 'US', genres: ['Animação'] })).toBe(false)
})
