import { t } from './i18n'
import { manifestUrl } from './addons'
export function parseDeepLink(
  input: string,
): { kind: 'addon'; url: string } | { kind: 'meta'; type: string; id: string } {
  if (input.length > 8192) throw Error(t('Lien trop long.'))
  const u = new URL(input)
  if (!['stremio:', 'primio:'].includes(u.protocol) || u.username || u.password)
    throw Error(t('Lien non pris en charge.'))
  if (u.protocol === 'primio:' && u.hostname === 'detail') {
    const [type, id, ...rest] = u.pathname.slice(1).split('/').map(decodeURIComponent)
    if (rest.length || !['movie', 'series', 'anime'].includes(type) || !id || id.length > 256)
      throw Error(t('Fiche invalide.'))
    return { kind: 'meta', type, id }
  }
  if (u.protocol === 'primio:' && u.hostname === 'addon') {
    const url = u.searchParams.get('url')
    if (!url) throw Error(t('Manifeste manquant.'))
    return { kind: 'addon', url: manifestUrl(url) }
  }
  return { kind: 'addon', url: manifestUrl(input.replace(/^(primio|stremio):/, 'https:')) }
}
