import { t } from './i18n'
import { invoke, isTauri } from '@tauri-apps/api/core'
export const API = 'https://primio-api.azks.fr'
export const isAndroid = () => isTauri() && /Android/i.test(navigator.userAgent)
export const isDesktop = () => isTauri() && !isAndroid()
export function scrollToTop() {
  if (isDesktop()) document.querySelector('.page-slide')?.scrollTo(0, 0)
  else window.scrollTo(0, 0)
}
const memory = new Map<string, string>()
export async function readSecure(key: string): Promise<string | null> {
  if (isTauri()) return invoke('secure_read', { key })
  return memory.get(key) ?? null
}
export async function writeSecure(key: string, value: string): Promise<void> {
  if (isTauri()) return invoke('secure_write', { key, value })
  memory.set(key, value)
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  token?: string,
): Promise<T> {
  if (isTauri())
    return invoke('api_request', { path, method, body: body ?? null, token: token ?? null })
  const r = await fetch(API + '/api/v1' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const data = r.status === 204 ? null : await r.json()
  if (!r.ok)
    throw Object.assign(
      Error(data?.errors?.[0]?.message ?? data?.message ?? t('La requête a échoué.')),
      { status: r.status, data },
    )
  return data
}
export async function openLink(url: string) {
  if (!url.startsWith('https://')) throw Error(t('Lien HTTPS requis.'))
  if (isTauri()) await invoke('open_link', { url })
  else window.open(url, '_blank', 'noopener,noreferrer')
}
