import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { appLanguages, locale, setLocale, t } from './i18n'
import { avatars, avatarUrl, createState, freeAvatar, normalizeState } from './preferences'
afterEach(() => setLocale('en'))
describe('Application languages and profile images', () => {
  it('defaults to English, switches all eight languages, and preserves interpolation', () => {
    expect(locale()).toBe('en')
    for (const [code] of appLanguages) {
      setLocale(code)
      expect(locale()).toBe(code)
      expect(t('Avatar {n}', { n: 7 })).toContain('7')
      expect(t('Paramètres')).toBeTruthy()
    }
    setLocale('unsupported')
    expect(t('Paramètres')).toBe('Settings')
  })
  it('ships the same translations and placeholders to the WebView and native player', () => {
    for (const file of readdirSync('src/locales').filter((f) => f.endsWith('.json'))) {
      const json = readFileSync('src/locales/' + file, 'utf8')
      expect(
        JSON.parse(
          readFileSync('src-tauri/gen/android/app/src/main/assets/locales/' + file, 'utf8'),
        ),
      ).toEqual(JSON.parse(json))
      for (const [key, value] of Object.entries(JSON.parse(json))) {
        expect((String(value).match(/\{\w+\}/g) ?? []).sort(), file + ':' + key).toEqual(
          (key.match(/\{\w+\}/g) ?? []).sort(),
        )
      }
    }
  })
  it('migrates duplicate and missing avatars without losing profiles or their libraries', () => {
    const base = createState()
    const profiles = Array.from({ length: 6 }, (_, i) => ({
      ...base.profiles[0],
      id: String(i),
      avatar: i < 3 ? '02' : undefined,
    }))
    const result = normalizeState({ ...base, profiles })
    expect(new Set(result.profiles.map((p) => p.avatar)).size).toBe(6)
    expect(result.profiles.map((p) => p.id)).toEqual(profiles.map((p) => p.id))
    expect(result.profiles[0].avatar).toBe('02')
    expect(result.profiles.some((p) => p.avatar === freeAvatar(result.profiles))).toBe(false)
    expect(avatarUrl('../outside')).toBe('/avatars/01.jpg')
    for (const id of avatars)
      expect(readFileSync('public/avatars/' + id + '.jpg').length).toBeGreaterThan(1000)
  })
})
