import { correctAnimeDates } from './anime-dates'
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
export const catalog = async (a: Addon, type: string, id: string, extra?: Record<string, string>) =>
  (await json<{ metas: Meta[] }>(resourceUrl(a, 'catalog', type, id, extra))).metas ?? []
async function datedMetadata(meta: Meta): Promise<Meta> {
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
  if (!duplicatePremiere && !meta.videos.some((v) => !v.released || v.releaseUnconfirmed)) return meta
  const dates = new Map<number, string | null>()
  try {
    const result = await json<{
      data: { attributes: { number: number; airdate: string | null } }[]
    }>(`https://kitsu.io/api/edge/anime/${meta.id.split(':')[1]}/episodes?page[limit]=20`)
    result.data.forEach((v) => dates.set(v.attributes.number, v.attributes.airdate))
  } catch {}
  return correctAnimeDates(meta, dates)
}
export async function metadata(addons: Addon[], meta: Meta): Promise<Meta> {
  if (/^mal:\d+$/.test(meta.id)) {
    try {
      const result = await json<{ data: { relationships: { item: { data: { id: string } } } }[] }>(
        `https://kitsu.io/api/edge/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=${meta.id.slice(4)}`,
      )
      const kitsu = result.data?.[0]?.relationships.item.data.id
      if (kitsu) return metadata(addons, { ...meta, id: 'kitsu:' + kitsu, category: 'anime' })
    } catch {}
  }

  for (const a of addons.filter((x) => supports(x, 'meta', meta.type, meta.id))) {
    try {
      const r = await json<{ meta: Meta }>(resourceUrl(a, 'meta', meta.type, meta.id))
      if (r.meta) return datedMetadata({ ...meta, ...r.meta })
    } catch {}
  }
  if (/^kitsu:\d+$/.test(meta.id)) {
    try {
      const result = await json<{ meta: Meta }>(
        resourceUrl(
          { url: 'https://anime-kitsu.strem.fun/manifest.json' },
          'meta',
          meta.type,
          meta.id,
        ),
      )
      if (result.meta) return datedMetadata({ ...meta, ...result.meta, category: 'anime' })
    } catch {}
  }
  return meta
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
