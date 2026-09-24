import { t } from './i18n'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { createCatalogPager, type CatalogTarget } from './catalog-pager'
import type { Meta } from './types'
import { CardSkeleton } from './media-image'

export function Deferred({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} style={{ minHeight: visible ? undefined : 160 }}>
      {visible ? (
        children
      ) : (
        <div className="poster-grid" role="status" aria-label={t('Chargement')}>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}
    </div>
  )
}

export function useDebounced<T>(value: T, delay = 350) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

export function ProgressiveList<T>({
  items,
  renderItem,
  className,
  batchSize = 24,
  hasMore = false,
  loading = false,
  error = false,
  onLoadMore,
}: {
  items: T[]
  renderItem: (item: T) => ReactNode
  className: string
  batchSize?: number
  hasMore?: boolean
  loading?: boolean
  error?: boolean
  onLoadMore?: () => void
}) {
  const [limit, setLimit] = useState(batchSize)
  const trigger = useRef<HTMLButtonElement>(null)
  const localMore = limit < items.length
  const more = localMore || hasMore
  useEffect(() => {
    const element = trigger.current
    if (!element || loading || error || !more || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        if (localMore) setLimit((value) => value + batchSize)
        else onLoadMore?.()
      },
      { rootMargin: '300px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [more, localMore, limit, items.length, loading, error, batchSize, onLoadMore])
  return (
    <>
      <div className={className} aria-busy={loading}>
        {items.slice(0, limit).map(renderItem)}
        {loading &&
          Array.from({ length: items.length ? 3 : 6 }, (_, index) => (
            <CardSkeleton key={'loading-' + index} episode={className === 'episode-list'} />
          ))}
      </div>
      {more && (
        <button
          ref={trigger}
          className="secondary load-more"
          disabled={loading}
          onClick={() => (localMore ? setLimit((value) => value + batchSize) : onLoadMore?.())}
        >
          {loading ? (
            <>
              <LoaderCircle className="spin" /> {t('Chargement…')}
            </>
          ) : error ? (
            t('Réessayer')
          ) : (
            t('Afficher la suite')
          )}
        </button>
      )}
    </>
  )
}

// Remount with a new key when the query, provider selection or category changes.
export function CatalogFeed({
  targets,
  query,
  genre = '',
  renderItem,
  empty,
  filterItem,
}: {
  targets: CatalogTarget[]
  query: string
  genre?: string
  renderItem: (meta: Meta) => ReactNode
  empty: ReactNode
  filterItem?: (meta: Meta) => boolean
}) {
  const [state, setState] = useState({
    items: [] as Meta[],
    hasMore: targets.length > 0,
    failed: false,
    loading: true,
  })
  const load = useRef<() => void>(() => {})
  useEffect(() => {
    let active = true
    let busy = false
    const pager = createCatalogPager(targets, query, undefined, genre)
    load.current = () => {
      if (!active || busy) return
      busy = true
      setState((s) => ({ ...s, loading: true, failed: false }))
      pager
        .load()
        .then((result) => {
          if (active) setState({ ...result, loading: false })
        })
        .finally(() => {
          busy = false
        })
    }
    load.current()
    return () => {
      active = false
    }
  }, [])
  return (
    <>
      {state.failed && (
        <p className="muted" role="status">
          {t('Certains catalogues sont indisponibles.')}
        </p>
      )}
      <ProgressiveList
        items={filterItem ? state.items.filter(filterItem) : state.items}
        renderItem={renderItem}
        className="poster-grid"
        hasMore={state.hasMore}
        loading={state.loading}
        error={state.failed}
        onLoadMore={() => load.current()}
      />
      {!state.loading &&
        !state.hasMore &&
        !(filterItem ? state.items.filter(filterItem) : state.items).length &&
        empty}
    </>
  )
}
