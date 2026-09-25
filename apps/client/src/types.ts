export type Resource = 'catalog' | 'meta' | 'stream' | 'subtitles'
export interface Manifest {
  id: string
  name: string
  version: string
  description?: string
  logo?: string
  types: string[]
  resources: (string | { name: string; types?: string[]; idPrefixes?: string[] })[]
  idPrefixes?: string[]
  catalogs?: {
    id: string
    name?: string
    type: string
    extra?: { name: string; isRequired?: boolean; options?: string[] }[]
  }[]
  behaviorHints?: { configurable?: boolean; configurationRequired?: boolean }
}
export interface Addon {
  url: string
  enabled: boolean
  manifest: Manifest
}
export interface Meta {
  id: string
  type: string
  name: string
  poster?: string
  logo?: string
  background?: string
  description?: string
  releaseInfo?: string
  imdbRating?: string
  genres?: string[]
  cast?: string[]
  director?: string[]
  runtime?: string
  seasonCount?: number
  originalLanguage?: string
  original_language?: string
  country?: string | string[]
  origin_country?: string[]
  production_countries?: { iso_3166_1?: string; name?: string }[]
  category?: 'anime'
  trailers?: { source?: string; ytId?: string; url?: string; externalUrl?: string }[]
  trailerStreams?: { source?: string; ytId?: string; url?: string; externalUrl?: string }[]
  videos?: {
    id: string
    title: string
    name?: string
    season?: number
    episode?: number
    releaseUnconfirmed?: boolean
    released?: string
    thumbnail?: string
    overview?: string
    description?: string
    runtime?: string
    duration?: number
  }[]
}
export interface Stream {
  url?: string
  externalUrl?: string
  infoHash?: string
  fileIdx?: number
  name?: string
  title?: string
  description?: string
  subtitles?: { id: string; url: string; lang: string }[]
  audioLanguages?: string[]
  subtitleLanguages?: string[]
  behaviorHints?: {
    bingeGroup?: string
    videoSize?: number
    filename?: string
    notWebReady?: boolean
    proxyHeaders?: { request?: Record<string, string> }
  }
  addonName?: string
  addonKey?: string
}
export interface Progress extends Pick<Meta, 'id' | 'type' | 'name' | 'poster' | 'category'> {
  episodeThumbnail?: string
  episode?: number
  season?: number
  seasonCount?: number
  watched?: boolean
  videoId: string
  position: number
  duration: number
  updatedAt: number
}
export interface Settings {
  tvMode?: 'auto' | 'on' | 'off'
  uiLanguage: string
  contentColumns: 3 | 4 | 5
  showPosterLabels: boolean
  hideWatched: boolean
  episodeNotifications: boolean
  updateNotifications: boolean
  player: 'internal' | 'external'
  language: string
  subtitles: boolean
  reduceMotion: boolean
  audioLanguage: string
  sourceFilters?: { provider: string; quality: string; format: string; size: string }
  explorerSort?: { key: 'default' | 'name' | 'rating' | 'year'; direction: 'asc' | 'desc' }
  sourcePreferences?: import('./source-preferences').SourcePreference[]
  audioByType?: Partial<Record<'movie' | 'series' | 'anime', string>>
  subtitleLanguage: string
  seekBackward: number
  seekForward: number
  autoNextEpisode: boolean
  subtitleFont: 'sans-serif' | 'serif' | 'monospace'
  subtitleColor: string
  subtitleOutline: number
  subtitleBackground: boolean
  forceSubtitleStyle: boolean
  subtitleSize: number
  playbackSpeed: number
  hardwareDecoding: boolean
  rememberPosition: boolean
  showSpoilers: boolean
  showContinue: boolean
  swipeNavigation: boolean
  posterSize: 'compact' | 'comfortable'
  cacheSizeGb: number
  deleteWatchedDownloads: boolean
  unwatchedDownloadDays: number
  downloadWifiOnly: boolean
  skipIntro: boolean
  aniSkip: boolean
  autoSkipIntro: boolean
}
export interface Profile {
  deletedProgress?: import('./progress-deletions').ProgressDeletion[]
  collections?: Collection[]
  avatar?: string
  lastPlaybackAt?: number
  id: string
  name: string
  color: string
  library: UserState['library']
  progress: Progress[]
  settings: Settings
}
export interface UserState {
  deletedProgress?: import('./progress-deletions').ProgressDeletion[]
  collections?: Collection[]
  library: Pick<Meta, 'id' | 'type' | 'name' | 'poster' | 'category'>[]
  progress: Progress[]
  addons: { url: string; enabled: boolean }[]
  settings: Settings
  profiles: Profile[]
  activeProfileId: string
}
export interface Subtitle {
  id: string
  url: string
  lang: string
}
export interface Collection {
  id: string
  name: string
  items: string[]
}
