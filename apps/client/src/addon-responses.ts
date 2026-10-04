import type { Manifest, Meta, Stream, Subtitle } from './types'

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined
const stringArray = (value: unknown) =>
  Array.isArray(value) && value.every(item => typeof item === 'string')
const optionalStrings = (value: unknown) => value === undefined || stringArray(value)

// Capabilities must remain exact: malformed restrictions cannot become unrestricted.
export function validManifest(value: unknown): value is Manifest {
  if (!object(value) || typeof value.id !== 'string' || typeof value.name !== 'string' ||
      !stringArray(value.types) || !Array.isArray(value.resources) ||
      !optionalStrings(value.idPrefixes) ||
      ['version', 'description', 'logo'].some(key => value[key] !== undefined && typeof value[key] !== 'string')) return false
  if (!value.resources.every(resource => typeof resource === 'string' ||
      object(resource) && typeof resource.name === 'string' &&
      optionalStrings(resource.types) && optionalStrings(resource.idPrefixes))) return false
  return value.catalogs === undefined || Array.isArray(value.catalogs) && value.catalogs.every(c =>
    object(c) && typeof c.id === 'string' && typeof c.type === 'string' &&
    (c.name === undefined || typeof c.name === 'string') &&
    (c.extra === undefined || Array.isArray(c.extra) && c.extra.every(e => object(e) &&
      typeof e.name === 'string' && (e.isRequired === undefined || typeof e.isRequired === 'boolean') &&
      optionalStrings(e.options))),
  )
}

function textFields(value: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(fields.flatMap(key => typeof value[key] === 'string' ? [[key, value[key]]] : []))
}
function numberFields(value: Record<string, unknown>, fields: readonly string[]) {
  return Object.fromEntries(fields.flatMap(key => typeof value[key] === 'number' && Number.isFinite(value[key])
    ? [[key, value[key]]] : []))
}

// Catalog and detail responses share one boundary before reaching React or classifiers.
export function parseAddonMeta(value: unknown, fallback?: Meta): Meta | null {
  if (!object(value)) return null
  if (fallback && ((value.id && value.id !== fallback.id) || (value.type && value.type !== fallback.type))) return null
  const id = fallback?.id ?? value.id, type = fallback?.type ?? value.type
  const name = typeof value.name === 'string' ? value.name : fallback?.name
  if (typeof id !== 'string' || !id || typeof type !== 'string' || !type || typeof name !== 'string') return null
  const meta: Meta = {
    id, type, name,
    ...textFields(value, ['poster', 'logo', 'background', 'description', 'releaseInfo', 'imdbRating',
      'runtime', 'originalLanguage', 'original_language', 'ratingSource']),
    ...numberFields(value, ['rating', 'seasonCount']),
    ...(value.category === 'anime' ? { category: 'anime' } : {}),
  }
  for (const field of ['genres', 'cast', 'director', 'origin_country'] as const)
    if (strings(value[field])) meta[field] = strings(value[field])
  if (typeof value.country === 'string') meta.country = value.country
  else if (strings(value.country)) meta.country = strings(value.country)
  if (Array.isArray(value.production_countries))
    meta.production_countries = value.production_countries.filter(object).map(c => textFields(c, ['iso_3166_1', 'name']))
  if (Array.isArray(value.videos)) meta.videos = value.videos.flatMap(v => {
    if (!object(v) || typeof v.id !== 'string' || !v.id) return []
    return [{
      id: v.id, title: typeof v.title === 'string' ? v.title : typeof v.name === 'string' ? v.name : '',
      ...textFields(v, ['name', 'released', 'thumbnail', 'overview', 'description', 'runtime']),
      ...numberFields(v, ['season', 'episode', 'duration']),
      ...(typeof v.releaseUnconfirmed === 'boolean' ? { releaseUnconfirmed: v.releaseUnconfirmed } : {}),
    }]
  })
  for (const field of ['trailers', 'trailerStreams'] as const)
    if (Array.isArray(value[field])) meta[field] = value[field].filter(object)
      .map(trailer => textFields(trailer, ['source', 'ytId', 'url', 'externalUrl']))
  return meta
}

export function parseAddonSubtitles(value: unknown): Subtitle[] {
  return Array.isArray(value) ? value.flatMap(item => object(item) &&
    typeof item.id === 'string' && typeof item.url === 'string' && typeof item.lang === 'string'
    ? [{ id: item.id, url: item.url, lang: item.lang }] : []) : []
}

export function parseAddonStream(value: unknown): Stream | null {
  if (!object(value)) return null
  const stream: Stream = {
    ...textFields(value, ['url', 'externalUrl', 'infoHash', 'name', 'title', 'description']),
    ...numberFields(value, ['fileIdx']),
    audioLanguages: strings(value.audioLanguages),
    subtitleLanguages: strings(value.subtitleLanguages),
    subtitles: parseAddonSubtitles(value.subtitles),
  }
  if (object(value.behaviorHints)) {
    const hints = value.behaviorHints
    stream.behaviorHints = {
      ...textFields(hints, ['bingeGroup', 'filename']),
      ...numberFields(hints, ['videoSize']),
      ...(typeof hints.notWebReady === 'boolean' ? { notWebReady: hints.notWebReady } : {}),
    }
    if (object(hints.proxyHeaders) && object(hints.proxyHeaders.request))
      stream.behaviorHints.proxyHeaders = { request: Object.fromEntries(
        Object.entries(hints.proxyHeaders.request).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      ) }
  }
  return stream
}
