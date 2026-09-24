import { sortCatalog, type CatalogSort } from './catalog-sort'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { json } from './addons'
import { t } from './i18n'
import { ProgressiveList } from './progressive'
import type { Meta } from './types'
const seasons = ['winter', 'spring', 'summer', 'fall'] as const
const labels = ['Hiver', 'Printemps', 'Été', 'Automne']
export const currentSeason = (now = new Date()) =>
  `${now.getFullYear()}-${seasons[Math.floor(now.getMonth() / 3)]}`
export function seasonOptions(now = new Date()): [string, string][] {
  const result: [string, string][] = []
  for (let year = now.getFullYear() + 1; year >= 1960; year--)
    for (let index = 3; index >= 0; index--)
      result.push([`${year}-${seasons[index]}`, `${t(labels[index])} ${year}`])
  return result
}
export function seasonUrl(season: string, query: string, offset: number) {
  const match = /^(\d{4})-(winter|spring|summer|fall)$/.exec(season)
  if (!match) throw Error('Invalid season')
  const url = new URL('https://kitsu.io/api/edge/anime')
  url.searchParams.set('filter[seasonYear]', match[1])
  url.searchParams.set('filter[season]', match[2])
  if (query) url.searchParams.set('filter[text]', query)
  url.searchParams.set('page[limit]', '20')
  url.searchParams.set('page[offset]', String(offset))
  url.searchParams.set('sort', 'popularityRank')
  return url.href
}
type KitsuPage = {
  data: {
    id: string
    attributes: {
      canonicalTitle: string
      synopsis?: string
      startDate?: string
      posterImage?: { large?: string }
      coverImage?: { large?: string }
      youtubeVideoId?: string
      subtype?: string
    }
  }[]
  links?: { next?: string }
}
const cache = new Map<string, { at: number; page: KitsuPage }>()
export function SeasonalAnime({
  season,
  query,
  renderItem,
  sort,
}: {
  season: string
  query: string
  sort?: CatalogSort
  renderItem: (m: Meta) => ReactNode
}) {
  const [state, setState] = useState({
    items: [] as Meta[],
    loading: true,
    error: false,
    more: true,
  })
  const load = useRef<() => void>(() => {})
  useEffect(() => {
    let active = true,
      busy = false,
      offset = 0
    load.current = async () => {
      if (busy || !active) return
      busy = true
      setState((s) => ({ ...s, loading: true, error: false }))
      try {
        const url = seasonUrl(season, query, offset),
          saved = cache.get(url)
        const page =
          saved && Date.now() - saved.at < 300000 ? saved.page : await json<KitsuPage>(url)
        cache.set(url, { at: Date.now(), page })
        if (cache.size > 20) cache.delete(cache.keys().next().value!)
        const items = page.data.map(({ id, attributes: a }): Meta => ({
          id: 'kitsu:' + id,
          type: a.subtype === 'movie' ? 'movie' : 'series',
          category: 'anime',
          name: a.canonicalTitle,
          description: a.synopsis,
          poster: a.posterImage?.large,
          background: a.coverImage?.large,
          releaseInfo: a.startDate?.slice(0, 4),
          trailers: a.youtubeVideoId ? [{ ytId: a.youtubeVideoId }] : [],
        }))
        offset += page.data.length
        if (active)
          setState((s) => ({
            items: [...new Map([...s.items, ...items].map((m) => [m.id, m])).values()],
            loading: false,
            error: false,
            more: !!page.links?.next && items.length > 0,
          }))
      } catch {
        if (active) setState((s) => ({ ...s, loading: false, error: true }))
      } finally {
        busy = false
      }
    }
    void load.current()
    return () => {
      active = false
    }
  }, [season, query])
  return (
    <>
      <h2 className="season-heading">{seasonOptions().find(([id]) => id === season)?.[1]}</h2>
      <ProgressiveList
        items={sortCatalog(state.items, sort)}
        renderItem={renderItem}
        className="poster-grid"
        loading={state.loading}
        error={state.error}
        hasMore={state.more}
        onLoadMore={() => load.current()}
      />
      {state.error && (
        <p role="alert" className="muted">
          {t('Le catalogue est indisponible. Réessayez.')}
        </p>
      )}
      {!state.loading && !state.error && !state.items.length && (
        <p className="muted">{t('Aucun résultat')}</p>
      )}
      <small className="catalog-credit">Kitsu</small>
    </>
  )
}
