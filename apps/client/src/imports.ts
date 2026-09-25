import { invoke, isTauri } from '@tauri-apps/api/core'
import { manifestUrl } from './addons'
import type { UserState } from './types'
export interface ImportPreview {
  library: UserState['library']
  addons: (UserState['addons'][number] & { name?: string })[]
  skipped: number
}
export async function providerRequest(operation: string, body: unknown): Promise<any> {
  if (isTauri()) return invoke('provider_request', { operation, body })
  const paths: Record<string, string> = {
    anilist: 'https://graphql.anilist.co',
    stremioLogin: 'https://api.strem.io/api/login',
    stremioAddons: 'https://api.strem.io/api/addonCollectionGet',
    stremioLibrary: 'https://api.strem.io/api/datastoreGet',
  }
  if (!paths[operation]) throw Error('Unknown provider')
  const response = await fetch(paths[operation], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
    credentials: 'omit',
  })
  if (!response.ok) throw Error('HTTP ' + response.status)
  return response.json()
}
const safePoster = (value: unknown) =>
  typeof value === 'string' && value.startsWith('https://') ? value : undefined
export function parseImportJson(raw: any): ImportPreview {
  const result: ImportPreview = { library: [], addons: [], skipped: 0 }
  const lists = raw?.data?.MediaListCollection?.lists ?? raw?.MediaListCollection?.lists
  const entries = Array.isArray(raw)
    ? raw
    : lists
      ? lists.flatMap((list: any) => list.entries ?? [])
      : (raw?.library ?? raw?.items ?? raw?.watchlist ?? raw?.result?.items ?? raw?.result ?? [])
  const items = Array.isArray(entries) ? entries : Object.values(entries)
  for (const row of items) {
    if (!row || row.removed || row.transportUrl) continue
    const media = row.media ?? row.movie ?? row.show ?? row
    const mal = media.idMal
    const id = mal
      ? 'mal:' + mal
      : (media.ids?.imdb ?? media._id ?? (typeof media.id === 'string' ? media.id : null))
    const name =
      typeof media.title === 'object'
        ? (media.title.english ?? media.title.romaji ?? media.title.native)
        : (media.name ?? media.title)
    const anime =
      !!row.media || media.category === 'anime' || /^(mal|kitsu|anilist):/.test(id ?? '')
    const type =
      row.movie || media.type === 'movie' || media.format === 'MOVIE'
        ? 'movie'
        : row.show || anime || media.type === 'series'
          ? 'series'
          : ''
    if (!id || !name || !type || String(id).length > 256) {
      result.skipped++
      continue
    }
    result.library.push({
      id: String(id),
      type,
      name: String(name).slice(0, 500),
      poster: safePoster(media.poster ?? media.coverImage?.large),
      ...(anime ? { category: 'anime' as const } : {}),
    })
  }
  const addons =
    raw?.addons ?? raw?.result?.addons ?? (items.every((r: any) => r?.transportUrl) ? items : [])
  for (const addon of addons) {
    try {
      result.addons.push({
        url: manifestUrl(addon.transportUrl ?? addon.url ?? addon),
        enabled: true,
        name:
          typeof addon.manifest?.name === 'string' ? addon.manifest.name.slice(0, 200) : undefined,
      })
    } catch {
      result.skipped++
    }
  }
  result.library = [...new Map(result.library.map((m) => [m.type + ':' + m.id, m])).values()]
  result.addons = [...new Map(result.addons.map((a) => [a.url, a])).values()]
  return result
}
export function parseMalXml(text: string): ImportPreview {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('Invalid XML')
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror') || !doc.querySelector('myanimelist'))
    throw Error('Invalid MyAnimeList export')
  const library: UserState['library'] = []
  for (const anime of doc.querySelectorAll('anime')) {
    const id = anime.querySelector('series_animedb_id')?.textContent?.trim(),
      name = anime.querySelector('series_title')?.textContent?.trim()
    const type = anime.querySelector('series_type')?.textContent?.trim()
    if (id && /^\d+$/.test(id) && name)
      library.push({
        id: 'mal:' + id,
        type: type === '3' || type?.toLowerCase() === 'movie' ? 'movie' : 'series',
        name: name.slice(0, 500),
        category: 'anime',
      })
  }
  return { library, addons: [], skipped: 0 }
}
export async function readImport(file: File) {
  if (file.size > 10_000_000) throw Error('10 MB maximum')
  let stream: ReadableStream<Uint8Array<ArrayBuffer>> = file.stream()
  if (file.name.endsWith('.gz')) stream = stream.pipeThrough(new DecompressionStream('gzip'))
  const reader = stream.getReader()
  let text = '',
    size = 0
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 10_000_000) throw Error('10 MB maximum')
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    await reader.cancel()
  }
  return file.name.endsWith('.csv')
    ? parseTraktCsv(text)
    : text.trimStart().startsWith('<')
      ? parseMalXml(text)
      : parseImportJson(JSON.parse(text))
}
export function parseTraktCsv(text: string): ImportPreview {
  const rows: string[][] = []
  let row: string[] = [],
    cell = '',
    quoted = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if (char === '\n' && !quoted) {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (quoted) throw Error('Invalid CSV')
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }
  const headers = (rows.shift() ?? []).map((h) => h.trim().toLowerCase().replace(/[ .-]/g, '_'))
  const pick = (r: string[], ...names: string[]) =>
    names.map((n) => r[headers.indexOf(n)]).find(Boolean)
  return parseImportJson(
    rows
      .filter((r) => r.some(Boolean))
      .map((r) => {
        const type = pick(r, 'type', 'media_type', 'item_type')
        return {
          id: pick(r, 'imdb', 'imdb_id', 'ids_imdb'),
          name: pick(r, 'title', 'name', 'show_title'),
          type: type === 'show' ? 'series' : type,
        }
      }),
  )
}
export async function importAnilist(userName: string) {
  const data = await providerRequest('anilist', {
    query:
      'query ($userName: String!) { MediaListCollection(userName:$userName,type:ANIME) { lists { entries { media { idMal format title { romaji english native } coverImage { large } } } } } }',
    variables: { userName: userName.trim() },
  })
  if (data.errors) throw Error(data.errors[0]?.message ?? 'AniList unavailable')
  return parseImportJson(data)
}
export async function importStremio(email: string, password: string) {
  const login = await providerRequest('stremioLogin', {
    email,
    password,
    type: 'Login',
    facebook: false,
  })
  const authKey = login.result?.authKey
  if (!authKey) throw Error(login.error?.message ?? 'Stremio authentication failed')
  {
    const [addons, library] = await Promise.all([
      providerRequest('stremioAddons', { authKey, update: false }),
      providerRequest('stremioLibrary', { authKey, collection: 'libraryItem', ids: [], all: true }),
    ])
    if (addons.error || library.error) throw Error('Stremio import failed')
    return parseImportJson({
      addons: addons.result?.addons ?? addons.result ?? [],
      library: library.result?.items ?? library.result ?? [],
    })
  }
}
export function mergeImport(
  state: UserState,
  preview: ImportPreview,
  addons = true,
  library = true,
): UserState {
  const nextLibrary = library
    ? [
        ...new Map(
          [...state.library, ...preview.library].map((m) => [m.type + ':' + m.id, m]),
        ).values(),
      ]
    : state.library
  const nextAddons = addons
    ? [...new Map([...preview.addons, ...state.addons].map((a) => [a.url, a])).values()]
    : state.addons
  if (nextLibrary.length > 2000 || nextAddons.length > 100)
    throw Error('Import limit exceeded: 2000 titles / 100 addons')
  return { ...state, library: nextLibrary, addons: nextAddons }
}
