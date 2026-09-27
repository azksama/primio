import { correctAnimeDates } from './anime-dates'
import { isAnime } from './preferences'
const animeIds = new Set<string>()
const classify = (meta: Meta): Meta => {
  const key = JSON.stringify([meta.type, meta.id])
  if (isAnime(meta)) {
    if (animeIds.size >= 5000) animeIds.clear()
    animeIds.add(key)
  }
  return animeIds.has(key) ? { ...meta, category: 'anime' } : meta
}
import { t } from './i18n'
import { invoke, isTauri } from '@tauri-apps/api/core'
import type { Addon, Manifest, Meta, Resource, Stream, Subtitle } from './types'
export function manifestUrl(input: string): string {
  const url = new URL(input.trim().replace(/^stremio:\/\//i, 'https://'))
  if (url.protocol !== 'https:' || url.username || url.password)
    throw Error(t('Utilisez un lien de manifeste HTTPS.'))
  url.hash = ''
  url.search = ''
  if (!url.pathname.endsWith('/manifest.json'))
    url.pathname = url.pathname.replace(/\/$/, '') + '/manifest.json'
  return url.href
}
export async function json<T>(url: string): Promise<T> {
  if (isTauri()) return invoke<T>('fetch_json', { url })
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok) throw Error(t('Le fournisseur ne répond pas (') + response.status + ').')
  const text = await response.text()
  if (text.length > 5_000_000) throw Error(t('Réponse trop volumineuse.'))
  return JSON.parse(text)
}
export async function inspectAddon(input: string): Promise<Addon> {
  const url = manifestUrl(input),
    m = await json<Manifest>(url)
  if (
    !m ||
    typeof m.id !== 'string' ||
    typeof m.name !== 'string' ||
    !Array.isArray(m.resources) ||
    !Array.isArray(m.types)
  )
    throw Error(t('Ce lien ne contient pas un manifeste Stremio valide.'))
  return { url, manifest: m, enabled: true }
}
export function supports(a: Addon, resource: Resource, type: string, id?: string): boolean {
  if (!a.enabled || !a.manifest.types.includes(type)) return false
  return a.manifest.resources.some((r) => {
    if (typeof r === 'string')
      return (
        r === resource &&
        (!id ||
          !a.manifest.idPrefixes?.length ||
          a.manifest.idPrefixes.some((p) => id.startsWith(p)))
      )
    return (
      r.name === resource &&
      (!r.types?.length || r.types.includes(type)) &&
      (!id || !r.idPrefixes?.length || r.idPrefixes.some((p) => id.startsWith(p)))
    )
  })
}
export function resourceUrl(
  a: Pick<Addon, 'url'>,
  r: Resource,
  type: string,
  id: string,
  extra?: Record<string, string>,
): string {
  const base = a.url.slice(0, -'/manifest.json'.length)
  const suffix =
    extra && Object.keys(extra).length
      ? '/' +
        Object.entries(extra)
          .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
          .join('&')
      : ''
  return (
    base +
    '/' +
    r +
    '/' +
    encodeURIComponent(type) +
    '/' +
    encodeURIComponent(id) +
    suffix +
    '.json'
  )
}
export async function catalog(a: Addon, type: string, id: string, extra?: Record<string, string>) {
  const metas = (
    (await json<{ metas: Meta[] }>(resourceUrl(a, 'catalog', type, id, extra))).metas ?? []
  ).map(classify)
  const candidates = metas
    .filter(
      (m) =>
        m.type === 'series' &&
        !isAnime(m) &&
        m.genres?.some((g) => /^animation$/i.test(g)) &&
        !m.country &&
        !m.origin_country?.length &&
        supports(a, 'meta', m.type, m.id),
    )
    .slice(0, 40)
  let index = 0
  await Promise.all(
    Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (index < candidates.length) {
        const meta = candidates[index++]
        try {
          const result = await json<{ meta: Meta }>(resourceUrl(a, 'meta', meta.type, meta.id))
          if (result.meta) classify({ ...meta, ...result.meta })
        } catch {
          /* Keep the provider's category when origin is unavailable. */
        }
      }
    }),
  )
  return metas.map(classify)
}
async function datedMetadata(meta: Meta): Promise<Meta> {
  meta = classify(meta)
  if (!meta.videos?.length) return meta
  if (!/^kitsu:\d+$/.test(meta.id))
    return meta.category === 'anime' ? correctAnimeDates(meta, new Map()) : meta
  const seen = new Set<string>()
  const duplicatePremiere = meta.videos.some((v) => {
    if (!v.released) return false
    const found = seen.has(v.released)
    seen.add(v.released)
    return found
  })
  if (!duplicatePremiere && !meta.videos.some((v) => !v.released || v.releaseUnconfirmed))
    return meta
  const dates = new Map<number, string | null>()
  try {
    const result = await json<{
      data: { attributes: { number: number; airdate: string | null } }[]
    }>(`https://kitsu.io/api/edge/anime/${meta.id.split(':')[1]}/episodes?page[limit]=20`)
    result.data.forEach((v) => dates.set(v.attributes.number, v.attributes.airdate))
  } catch {}
  return correctAnimeDates(meta, dates)
}
const metadataCache = new Map<
  string,
  { at: number; value?: Meta; promise?: Promise<Meta>; listeners: Set<(m: Meta) => void> }
>()
const meaningful = (value: unknown) =>
  value !== undefined &&
  value !== null &&
  value !== '' &&
  (!Array.isArray(value) || value.length > 0)
export function mergeMetadata(primary: Meta, secondary: Meta): Meta {
  const result = {
    ...secondary,
    ...Object.fromEntries(Object.entries(primary).filter(([, v]) => meaningful(v))),
  } as Meta
  for (const field of ['genres', 'cast', 'director'] as const)
    result[field] = [...new Set([...(primary[field] ?? []), ...(secondary[field] ?? [])])]
  if (primary.videos?.length || secondary.videos?.length) {
    const episodes = new Map((secondary.videos ?? []).map((v) => [v.id, v]))
    for (const v of primary.videos ?? [])
      episodes.set(v.id, {
        ...episodes.get(v.id),
        ...Object.fromEntries(Object.entries(v).filter(([, x]) => meaningful(x))),
      } as NonNullable<Meta['videos']>[number])
    result.videos = [...episodes.values()].sort(
      (a, b) => (a.season ?? 1) - (b.season ?? 1) || (a.episode ?? 0) - (b.episode ?? 0),
    )
  }
  return result
}
const sufficientMetadata = (m: Meta) =>
  !!m.description && !!m.genres?.length && (m.type === 'movie' || !!m.videos?.length)
export function clearMetadataCache() {
  metadataCache.clear()
}
export async function metadata(
  addons: Addon[],
  meta: Meta,
  options: { refresh?: boolean; onUpdate?: (m: Meta) => void } = {},
): Promise<Meta> {
  const key = JSON.stringify([
    meta.type,
    meta.id,
    addons.filter((a) => a.enabled).map((a) => [a.url, a.manifest.version, a.manifest.resources]),
  ])
  let entry = metadataCache.get(key)
  if (
    entry?.value &&
    !options.refresh &&
    Date.now() - entry.at < (entry.value.metadataStatus === 'loaded' ? 300000 : 15000)
  )
    return mergeMetadata(entry.value, meta)
  if (!entry) {
    entry = { at: 0, listeners: new Set() }
    metadataCache.set(key, entry)
  }
  if (options.onUpdate) entry.listeners.add(options.onUpdate)
  const current = entry
  if (!entry.promise)
    entry.promise = (async () => {
      let base = meta
      if (/^mal:\d+$/.test(meta.id)) {
        try {
          const mapped = await json<{
            data: { relationships: { item: { data: { id: string } } } }[]
          }>(
            `https://kitsu.io/api/edge/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=${meta.id.slice(4)}`,
          )
          const id = mapped.data?.[0]?.relationships.item.data.id
          if (id)
            return metadata(addons, { ...meta, id: 'kitsu:' + id, category: 'anime' }, options)
        } catch {}
      }
      const eligible = addons.filter((a) => supports(a, 'meta', meta.type, meta.id))
      const urls = [...new Set(eligible.map((a) => resourceUrl(a, 'meta', meta.type, meta.id)))]
      if (/^kitsu:\d+$/.test(meta.id)) {
        const fallback = resourceUrl(
          { url: 'https://anime-kitsu.strem.fun/manifest.json' },
          'meta',
          meta.type,
          meta.id,
        )
        if (!urls.includes(fallback)) urls.push(fallback)
      }
      const results: (Meta | undefined)[] = Array(urls.length)
      let received = false
      const combine = () => {
        let merged = base
        for (let i = results.length - 1; i >= 0; i--)
          if (results[i]) merged = mergeMetadata(results[i]!, merged)
        return {
          ...classify(merged),
          metadataStatus: (received
            ? sufficientMetadata(merged)
              ? 'loaded'
              : 'partial'
            : 'unavailable') as Meta['metadataStatus'],
        }
      }
      for (let offset = 0; offset < urls.length; offset += 4) {
        await Promise.allSettled(
          urls.slice(offset, offset + 4).map(async (url, i) => {
            const r = await json<{ meta: Meta }>(url)
            if (
              !r.meta ||
              typeof r.meta !== 'object' ||
              Array.isArray(r.meta) ||
              (r.meta.id && r.meta.id !== meta.id) ||
              (r.meta.type && r.meta.type !== meta.type)
            )
              return
            const clean = {
              ...r.meta,
              id: meta.id,
              type: meta.type,
              name: typeof r.meta.name === 'string' ? r.meta.name : meta.name,
            }
            for (const field of [
              'poster',
              'logo',
              'background',
              'description',
              'releaseInfo',
              'imdbRating',
              'runtime',
              'originalLanguage',
              'original_language',
            ] as const)
              if (typeof clean[field] !== 'string') delete clean[field]
            for (const field of ['genres', 'cast', 'director'] as const)
              clean[field] = Array.isArray(clean[field])
                ? clean[field]!.filter((v) => typeof v === 'string')
                : []
            if (Array.isArray(clean.country))
              clean.country = clean.country.filter((v) => typeof v === 'string')
            else if (typeof clean.country !== 'string') delete clean.country
            clean.origin_country = Array.isArray(clean.origin_country)
              ? clean.origin_country.filter((v) => typeof v === 'string')
              : undefined
            clean.production_countries = Array.isArray(clean.production_countries)
              ? clean.production_countries
                  .filter((v) => v && typeof v === 'object')
                  .map((v) => ({
                    iso_3166_1: typeof v.iso_3166_1 === 'string' ? v.iso_3166_1 : undefined,
                    name: typeof v.name === 'string' ? v.name : undefined,
                  }))
              : undefined
            clean.videos = Array.isArray(clean.videos)
              ? clean.videos
                  .filter((v) => v && typeof v.id === 'string')
                  .map((v) => ({
                    ...v,
                    title:
                      typeof v.title === 'string'
                        ? v.title
                        : typeof v.name === 'string'
                          ? v.name
                          : '',
                  }))
              : undefined
            results[offset + i] = clean
            received = true
            const updated = combine()
            current.listeners.forEach((listener) => listener(updated))
          }),
        )
        if (sufficientMetadata(combine()) && combine().cast?.length && combine().director?.length)
          break
      }
      const result = await datedMetadata(combine())
      if (received) {
        current.value = result
        current.at = Date.now()
      } else metadataCache.delete(key)
      while (metadataCache.size > 150) {
        const victim = [...metadataCache].find(([, v]) => !v.promise)
        if (!victim) break
        metadataCache.delete(victim[0])
      }
      return result
    })().finally(() => {
      current.promise = undefined
    })
  try {
    return await entry.promise
  } finally {
    if (options.onUpdate) entry.listeners.delete(options.onUpdate)
  }
}
export async function streams(addons: Addon[], type: string, id: string) {
  const eligible = addons.filter((x) => supports(x, 'stream', type, id))
  const results = await Promise.allSettled(
    eligible.map(
      async (a) =>
        (await json<{ streams: Stream[] }>(resourceUrl(a, 'stream', type, id))).streams?.map(
          (s) => ({ ...s, addonName: a.manifest.name, addonKey: a.url }),
        ) ?? [],
    ),
  )
  return {
    items: results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])),
    failed: results.filter((r) => r.status === 'rejected').length,
    providers: eligible.length,
  }
}
export async function subtitles(addons: Addon[], type: string, id: string): Promise<Subtitle[]> {
  const results = await Promise.allSettled(
    addons
      .filter((x) => supports(x, 'subtitles', type, id))
      .map((a) => json<{ subtitles: Subtitle[] }>(resourceUrl(a, 'subtitles', type, id))),
  )
  return results.flatMap((r) => (r.status === 'fulfilled' ? (r.value.subtitles ?? []) : []))
}
export function playbackUrl(stream: Stream): string {
  const raw = stream.url ?? stream.externalUrl
  if (!raw)
    throw Error(
      stream.infoHash
        ? t('Cette source torrent nécessite un addon fournissant une URL de lecture.')
        : t('Cette source ne fournit pas de lien de lecture.'),
    )
  const u = new URL(raw)
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
    throw Error(t('Protocole de lecture non pris en charge.'))
  return u.href
}
