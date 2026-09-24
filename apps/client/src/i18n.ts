import en from './locales/en.json'
import de from './locales/de.json'
import es from './locales/es.json'
import pt from './locales/pt.json'
import ja from './locales/ja.json'
import zhHans from './locales/zh-Hans.json'
import zhHant from './locales/zh-Hant.json'
export const appLanguages = [
  ['en', 'English'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['es', 'Español'],
  ['pt', 'Português'],
  ['ja', '日本語'],
  ['zh-Hans', '简体中文'],
  ['zh-Hant', '繁體中文'],
] as const
const dictionaries: Record<string, Record<string, string>> = {
  en,
  de,
  es,
  pt,
  ja,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
}
let current = 'en'
export const locale = () => current
export function setLocale(value: string) {
  current = appLanguages.some(([id]) => id === value) ? value : 'en'
  if (typeof document !== 'undefined') document.documentElement.lang = current
}
export function t(key: string, values: Record<string, string | number> = {}) {
  const text =
    current === 'fr' ? key : (dictionaries[current]?.[key] ?? dictionaries.en[key] ?? key)
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    values[name] === undefined ? match : String(values[name]),
  )
}
export function languageName(code: string, fallback: string) {
  const aliases: Record<string, string> = {
    fra: 'fr',
    eng: 'en',
    jpn: 'ja',
    kor: 'ko',
    spa: 'es',
    por: 'pt',
    deu: 'de',
    ita: 'it',
    ara: 'ar',
    zho: 'zh',
    hin: 'hi',
    rus: 'ru',
    ukr: 'uk',
    pol: 'pl',
    nld: 'nl',
    tur: 'tr',
    swe: 'sv',
    dan: 'da',
    nor: 'no',
    fin: 'fi',
    ell: 'el',
    ces: 'cs',
    ron: 'ro',
    heb: 'he',
    tha: 'th',
    vie: 'vi',
    ind: 'id',
    msa: 'ms',
  }
  try {
    return aliases[code]
      ? (new Intl.DisplayNames([current], { type: 'language' }).of(aliases[code]) ?? t(fallback))
      : t(fallback)
  } catch {
    return t(fallback)
  }
}
