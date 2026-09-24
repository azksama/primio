import { t } from './i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { catalog, metadata } from './addons'
import { catalogTargets } from './catalog-pager'
import { matchesCategory } from './preferences'
import { Deferred } from './progressive'
import { CardSkeleton } from './media-image'
import type { Addon, Meta, UserState } from './types'
export function Recommendations(props: {
  category: string
  addons: Addon[]
  library: UserState['library']
  renderItem: (m: Meta) => ReactNode
  onExplore: () => void
}) {
  return (
    <Deferred>
      <RecommendationShelf {...props} />
    </Deferred>
  )
}
function RecommendationShelf({
  category,
  addons,
  library,
  renderItem,
  onExplore,
}: {
  category: string
  addons: Addon[]
  library: UserState['library']
  renderItem: (m: Meta) => ReactNode
  onExplore: () => void
}) {
  const [items, setItems] = useState<Meta[]>([]),
    [loading, setLoading] = useState(true),
    [inspired, setInspired] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true)
    void (async () => {
      const seed = library.find((m) => matchesCategory(m, category))
      const full = seed ? await metadata(addons, seed) : null
      const genres = full?.genres ?? []
      const targets = catalogTargets(
        addons,
        category === 'anime' ? 'series' : category,
        'all',
        '',
        category === 'anime',
        '',
        true,
      ).filter((t) => !t.catalog.extra?.some((e) => e.isRequired && e.name !== 'genre'))
      const tailored = targets.flatMap((t) => {
        const options = t.catalog.extra?.find((e) => e.name === 'genre')?.options ?? []
        const genre = genres.find((g) => options.includes(g))
        return genre ? [{ ...t, genre }] : []
      })
      const selected = (
        tailored.length
          ? tailored
          : targets
              .filter((t) => !t.catalog.extra?.some((e) => e.isRequired))
              .map((t) => ({ ...t, genre: '' }))
      ).slice(0, 2)
      const result = await Promise.allSettled(
        selected.map((t) =>
          catalog(t.addon, t.catalog.type, t.catalog.id, t.genre ? { genre: t.genre } : undefined),
        ),
      )
      const unique = new Map<string, Meta>()
      result.forEach((r) => {
        if (r.status === 'fulfilled')
          r.value.forEach((m) => {
            const key = m.type + ':' + m.id
            if (!library.some((v) => v.id === m.id && v.type === m.type))
              unique.set(key, category === 'anime' ? { ...m, category: 'anime' } : m)
          })
      })
      if (active) {
        setItems([...unique.values()].slice(0, 12))
        setInspired(tailored.length ? (seed?.name ?? '') : '')
      }
    })()
      .catch(() => {
        if (active) setItems([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [category, addons, library])
  return (
    <section className="shelf">
      <div className="section-head">
        <h2>
          {category === 'movie'
            ? t('Films pour vous')
            : category === 'series'
              ? t('Séries pour vous')
              : t('Animes pour vous')}
        </h2>
        <button onClick={onExplore}>{t('Tout voir')}</button>
      </div>
      {inspired && (
        <p className="recommendation-hint">
          {t('Parce que vous avez ajouté')}
          {' : '}
          {inspired}
        </p>
      )}
      {loading ? (
        <div className="skeleton-grid">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : items.length ? (
        <div className="poster-rail">{items.map(renderItem)}</div>
      ) : (
        <p className="muted">
          {category === 'anime'
            ? t('Ajoutez un catalogue anime dans Paramètres → Addons.')
            : t('Aucune suggestion disponible pour le moment.')}
        </p>
      )}
    </section>
  )
}
