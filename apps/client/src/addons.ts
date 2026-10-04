import { correctAnimeDates } from './anime-dates'
import { parseAddonMeta, parseAddonStream, parseAddonSubtitles, validManifest } from './addon-responses'
import { isAnime, isAnimation } from './preferences'
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
  if (!validManifest(m))
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
export type CatalogPage = Meta[] & { receivedCount?: number }
export async function catalog(a: Addon, type: string, id: string, extra?: Record<string, string>): Promise<CatalogPage> {
  const result = await json<{ metas?: unknown }>(resourceUrl(a, 'catalog', type, id, extra))
  if (!result || !Array.isArray(result.metas)) throw Error('Invalid catalog response')
  const metas = result.metas.flatMap(value => {
    const meta = parseAddonMeta(value)
    return meta ? [classify(meta)] : []
  })
  const candidates = metas
    .filter(
      (m) =>
        ['series', 'movie'].includes(m.type) &&
        !isAnime(m) &&
        isAnimation(m) &&
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
          const enriched = parseAddonMeta(result.meta, meta)
          if (enriched) classify({ ...meta, ...enriched })
        } catch {
          /* Keep the provider's category when origin is unavailable. */
        }
      }
    }),
  )
  // Keep raw provider offsets when malformed entries were discarded.
  return Object.defineProperty(metas.map(classify), 'receivedCount', { value: result.metas.length })
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
            const clean = parseAddonMeta(r?.meta, meta)
            if (!clean) return
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
export type StreamResults = {
  items: Stream[]
  failed: number
  providers: number
  pending: number
  groups: { key: string; name: string; pending: boolean; failed: boolean }[]
}
export async function streams(addons: Addon[], type: string, id: string, onUpdate?: (result: StreamResults) => void) {
  const eligible = addons.filter((x) => supports(x, 'stream', type, id))
  // Slots stay in configured priority order, regardless of network response order.
  const slots = eligible.map((a) => ({ key: a.url, name: a.manifest.name, pending: true, failed: false, items: [] as Stream[] }))
  const snapshot = (): StreamResults => ({
    items: slots.flatMap(s => s.items), failed: slots.filter(s => s.failed).length,
    providers: slots.length, pending: slots.filter(s => s.pending).length,
    groups: slots.map(({ items: _items, ...group }) => ({ ...group })),
  })
  onUpdate?.(snapshot())
  await Promise.all(slots.map(async (slot, index) => {
    try {
      const result = await json<{ streams?: Stream[] }>(resourceUrl(eligible[index], 'stream', type, id))
      if (!Array.isArray(result.streams)) throw Error('Invalid stream response')
      slot.items = result.streams.flatMap((value, i) => {
        const stream = parseAddonStream(value)
        return stream ? [{ ...stream, addonName: slot.name, addonKey: slot.key, sourceKey: slot.key + ':' + i }] : []
      })
    } catch { slot.failed = true }
    finally { slot.pending = false; onUpdate?.(snapshot()) }
  }))
  return snapshot()
}
export async function subtitles(addons: Addon[], type: string, id: string): Promise<Subtitle[]> {
  const results = await Promise.allSettled(
    addons
      .filter((x) => supports(x, 'subtitles', type, id))
      .map((a) => json<{ subtitles: Subtitle[] }>(resourceUrl(a, 'subtitles', type, id))),
  )
  return results.flatMap(r => r.status === 'fulfilled' ? parseAddonSubtitles(r.value?.subtitles) : [])
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
