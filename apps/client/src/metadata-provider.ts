import { invoke, isTauri } from '@tauri-apps/api/core'
import { readSecure, writeSecure } from './platform'

export async function tmdbToken(accountId: string): Promise<string> {
  const raw = await readSecure('metadataCredentials')
  const credentials = raw ? JSON.parse(raw) : {}
  return typeof credentials['tmdb:' + accountId] === 'string' ? credentials['tmdb:' + accountId] : ''
}
export async function saveTmdbToken(accountId: string, token: string) {
  const raw = await readSecure('metadataCredentials')
  const credentials = raw ? JSON.parse(raw) : {}
  if (token) credentials['tmdb:' + accountId] = token
  else delete credentials['tmdb:' + accountId]
  await writeSecure('metadataCredentials', JSON.stringify(credentials))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('primio-metadata-changed'))
}

// The native bridge pins each request to its provider; redirects cannot receive credentials.
export const metadataFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input))
  if (!['api.themoviedb.org', 'graphql.anilist.co'].includes(url.host) || url.protocol !== 'https:')
    throw Error('Invalid metadata provider')
  if (!isTauri()) return fetch(input, { ...init, credentials: 'omit', redirect: 'error' })
  const tmdb = url.host === 'api.themoviedb.org'
  try {
    const data = await invoke('provider_request', {
      operation: tmdb ? 'tmdb' : 'anilist',
      body: tmdb ? {
        path: url.pathname.replace(/^\/3\//, ''),
        params: Object.fromEntries(url.searchParams),
        token: new Headers(init?.headers).get('Authorization')?.replace(/^Bearer /, '') ?? '',
      } : JSON.parse(String(init?.body)),
    })
    return Response.json(data)
  } catch (error) {
    const code = String(error)
    return new Response('', { status: code.includes('401') || code.includes('403') ? 401 : code.includes('429') ? 429 : 503 })
  }
}

export async function validateTmdbToken(token: string) {
  if (!token || token.length > 2048 || /\s/.test(token)) throw Error('TMDB_INVALID_TOKEN')
  const response = await metadataFetch('https://api.themoviedb.org/3/authentication', {
    headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? 'TMDB_INVALID_TOKEN' : 'PROVIDER_UNAVAILABLE')
  const data = await response.json()
  if (!data.success) throw Error('TMDB_INVALID_TOKEN')
}
