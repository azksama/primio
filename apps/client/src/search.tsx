import { type CatalogSort } from './catalog-sort'
import { type ReactNode } from 'react'
import { catalogTargets } from './catalog-pager'
import { CatalogFeed } from './progressive'
import { matchesCategory } from './preferences'
import type { Addon, Meta } from './types'
import { t } from './i18n'
export function GroupedSearch({
  addons,
  query,
  genre,
  choice,
  renderItem,
  sort,
}: {
  addons: Addon[]
  query: string
  genre: string
  choice: string
  sort?: CatalogSort
  renderItem: (meta: Meta) => ReactNode
}) {
  return (
    <>
      {(['movie', 'series', 'anime'] as const).map((type) => (
        <section className="search-section" key={type}>
          <h2>{t(type === 'movie' ? 'Films' : type === 'series' ? 'Séries' : 'Animes')}</h2>
          <CatalogFeed
            key={JSON.stringify([type, query, genre, choice, addons])}
            targets={catalogTargets(addons, type, choice, query, type === 'anime', genre)}
            query={query}
            genre={genre}
            filterItem={(m) => matchesCategory(m, type)}
            sort={sort}
            renderItem={renderItem}
            empty={<p className="muted">{t('Aucun résultat')}</p>}
          />
        </section>
      ))}
    </>
  )
}
