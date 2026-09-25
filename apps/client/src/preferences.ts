import { t } from './i18n'
import type { Meta, Profile, Settings, UserState } from './types'

export const languages = [
  ['fra', 'Français'],
  ['eng', 'Anglais'],
  ['jpn', 'Japonais'],
  ['kor', 'Coréen'],
  ['spa', 'Espagnol'],
  ['por', 'Portugais'],
  ['deu', 'Allemand'],
  ['ita', 'Italien'],
  ['ara', 'Arabe'],
  ['zho', 'Chinois'],
  ['hin', 'Hindi'],
  ['rus', 'Russe'],
  ['ukr', 'Ukrainien'],
  ['pol', 'Polonais'],
  ['nld', 'Néerlandais'],
  ['tur', 'Turc'],
  ['swe', 'Suédois'],
  ['dan', 'Danois'],
  ['nor', 'Norvégien'],
  ['fin', 'Finnois'],
  ['ell', 'Grec'],
  ['ces', 'Tchèque'],
  ['ron', 'Roumain'],
  ['heb', 'Hébreu'],
  ['tha', 'Thaï'],
  ['vie', 'Vietnamien'],
  ['ind', 'Indonésien'],
  ['msa', 'Malais'],
] as const
export const defaults: Settings = {
  uiLanguage: 'en',
  contentColumns: 3,
  showPosterLabels: true,
  hideWatched: false,
  episodeNotifications: false,
  updateNotifications: false,
  player: 'internal',
  language: 'fra',
  audioLanguage: 'fra',
  subtitleLanguage: 'fra',
  subtitles: true,
  reduceMotion: false,
  seekBackward: 10,
  seekForward: 10,
  autoNextEpisode: true,
  subtitleFont: 'sans-serif',
  subtitleColor: '#FFFFFF',
  subtitleOutline: 2,
  subtitleBackground: false,
  forceSubtitleStyle: false,
  subtitleSize: 40,
  playbackSpeed: 1,
  hardwareDecoding: true,
  rememberPosition: true,
  showSpoilers: true,
  showContinue: true,
  swipeNavigation: true,
  posterSize: 'comfortable',
  cacheSizeGb: 1,
  deleteWatchedDownloads: false,
  unwatchedDownloadDays: 0,
  downloadWifiOnly: true,
  skipIntro: true,
  aniSkip: true,
  autoSkipIntro: false,
}
export const avatars = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, '0'))
export const avatarUrl = (avatar?: string) =>
  '/avatars/' + (avatars.includes(avatar ?? '') ? avatar : '01') + '.jpg'
export const freeAvatar = (profiles: Profile[], except?: string) =>
  avatars.find((a) => !profiles.some((p) => p.id !== except && p.avatar === a)) ?? '01'
export const profileColors = ['#DAD4C5', '#BFBADE', '#C2D4BE', '#D9B5A2', '#AFC9D0', '#D8C183']
export function createState(): UserState {
  const profile: Profile = {
    id: 'main',
    avatar: '01',
    name: t('Mon profil'),
    color: profileColors[0],
    library: [],
    progress: [],
    settings: { ...defaults },
  }
  return {
    library: [],
    progress: [],
    settings: { ...defaults },
    addons: [{ url: 'https://v3-cinemeta.strem.io/manifest.json', enabled: true }],
    profiles: [profile],
    activeProfileId: profile.id,
  }
}
export function normalizeState(raw: Partial<UserState>): UserState {
  const base = createState()
  const settings = {
    ...defaults,
    ...raw.settings,
    audioLanguage: raw.settings?.audioLanguage ?? raw.settings?.language ?? 'fra',
    subtitleLanguage: raw.settings?.subtitleLanguage ?? raw.settings?.language ?? 'fra',
  }
  const state = { ...base, ...raw, settings }
  state.profiles = raw.profiles?.length
    ? raw.profiles.map((p) => ({ ...p, settings: { ...defaults, ...p.settings } }))
    : [{ ...base.profiles[0], library: state.library, progress: state.progress, settings }]
  const used = new Set<string>()
  state.profiles = state.profiles.map((p) => {
    const avatar =
      p.avatar && avatars.includes(p.avatar) && !used.has(p.avatar)
        ? p.avatar
        : avatars.find((a) => !used.has(a))!
    used.add(avatar)
    return { ...p, avatar }
  })
  state.activeProfileId = state.profiles.some((p) => p.id === raw.activeProfileId)
    ? raw.activeProfileId!
    : state.profiles[0].id
  return state
}
export function snapshotState(state: UserState): UserState {
  return {
    ...state,
    profiles: state.profiles.map((p) =>
      p.id === state.activeProfileId
        ? { ...p, deletedProgress: state.deletedProgress ?? [], collections: state.collections ?? [], library: state.library, progress: state.progress, settings: state.settings }
        : p,
    ),
  }
}
export function switchProfile(state: UserState, id: string): UserState {
  const saved = snapshotState(state),
    profile = saved.profiles.find((p) => p.id === id)
  return profile
    ? {
        ...saved,
        activeProfileId: id,
        collections: profile.collections ?? [],
        deletedProgress: profile.deletedProgress ?? [],
        library: profile.library,
        progress: profile.progress,
        settings: profile.settings,
      }
    : state
}
export function durationLabel(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds / 60)),
    hours = Math.floor(total / 60),
    minutes = total % 60
  return hours ? `${hours}h${String(minutes).padStart(2, '0')}` : `${total} min`
}
export function isAnime(meta: Pick<Meta, 'id' | 'type' | 'category'> & Partial<Meta>) {
  const origins = [meta.country].flat().concat(meta.origin_country ?? [], (meta.production_countries ?? []).flatMap(c => [c.iso_3166_1, c.name])).flatMap(c => typeof c === 'string' ? c.split(/[,;|]/) : [])
  const eastAsian = origins.some(c => typeof c === 'string' && /^(JP|JPN|Japan|Japon|KR|KOR|KP|Korea|South Korea|North Korea|Republic of Korea|Corée du Sud|CN|CHN|China|Chine|中国|日本|한국)$/i.test(c.trim()))
  const animation = meta.genres?.some(g => /^(animation|animated|动画|動畫|애니메이션)$/i.test(g))
  const original = meta.originalLanguage ?? meta.original_language ?? ''
  return (
    meta.category === 'anime' ||
    meta.type === 'anime' ||
    /^(kitsu|anilist|mal):/.test(meta.id) ||
    meta.genres?.some((g) => /^(animes?|donghua|aeni)$/i.test(g)) === true ||
    (meta.type === 'series' && animation === true && (eastAsian || (!origins.some(Boolean) && /^(ja|jpn|japanese|ko|kor|korean|zh|zho|chi|chinese|mandarin|cantonese)$/i.test(original))))
  )
}
export function matchesCategory(meta: Meta, category: string) {
  return (
    category === 'all' ||
    (category === 'anime' ? isAnime(meta) : !isAnime(meta) && meta.type === category)
  )
}
export function seasons(meta: Meta) {
  return [...new Set((meta.videos ?? []).map((v) => v.season ?? 1))].sort((a, b) => a - b)
}

export function audioPreference(settings: Settings, meta: Meta) {
  const type = isAnime(meta) ? 'anime' : meta.type === 'movie' ? 'movie' : 'series'
  const specific = settings.audioByType?.[type]
  const preference = specific && specific !== 'inherit' ? specific : settings.audioLanguage
  return preference === 'original' ? meta.originalLanguage || 'original' : preference
}
