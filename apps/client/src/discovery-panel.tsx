import { invoke, isTauri } from '@tauri-apps/api/core'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Addon, Collection, Meta } from './types'
import {
  affinity,
  discoveryPool,
  enrichDiscovery,
  fuzzyScore,
  matchesDiscovery,
  parseDiscoveryQuery,
  type DiscoveryFilters,
} from './discovery'
import { matchesCategory } from './preferences'
import { t } from './i18n'

export function DiscoveryControls({
  value,
  onChange,
  type = false,
}: {
  value: DiscoveryFilters
  onChange: (v: DiscoveryFilters) => void
  type?: boolean
}) {
  const numeric = (
    key: 'from' | 'to' | 'rating' | 'minutes',
    label: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <label>
      {t(label)}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value[key] ?? ''}
        placeholder="—"
        onChange={(e) =>
          onChange({
            ...value,
            [key]:
              e.target.value === ''
                ? undefined
                : Math.max(min, Math.min(max, Number(e.target.value))),
          })
        }
      />
    </label>
  )
  return (
    <div className="discovery-controls">
      {type && (
        <label>
          {t('Type')}
          <select
            value={value.type ?? ''}
            onChange={(e) => onChange({ ...value, type: e.target.value })}
          >
            {[
              ['', 'Tous'],
              ['movie', 'Films'],
              ['series', 'Séries'],
              ['anime', 'Animes'],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {t(l)}
              </option>
            ))}
          </select>
        </label>
      )}
      {type && (
        <label>
          {t('Genre')}
          <select
            value={value.genre ?? ''}
            onChange={(e) => onChange({ ...value, genre: e.target.value })}
          >
            {[
              '',
              'Action',
              'Adventure',
              'Comedy',
              'Drama',
              'Fantasy',
              'Horror',
              'Romance',
              'Science Fiction',
              'Thriller',
            ].map((g) => (
              <option key={g} value={g}>
                {g || t('Tous')}
              </option>
            ))}
          </select>
        </label>
      )}
      {numeric('from', 'Année minimum', 1900, 2100)}
      {numeric('to', 'Année maximum', 1900, 2100)}
      {numeric('rating', 'Note minimale', 0, 10, 0.5)}
      {numeric('minutes', 'Durée maximum (min)', 1, 600)}
      <label>
        {t('Pays')}
        <select
          value={value.country ?? ''}
          onChange={(e) => onChange({ ...value, country: e.target.value })}
        >
          {[
            ['', 'Tous'],
            ['JP', 'Japon'],
            ['KR', 'Corée du Sud'],
            ['CN', 'Chine'],
            ['US', 'États-Unis'],
            ['FR', 'France'],
            ['GB', 'Royaume-Uni'],
            ['DE', 'Allemagne'],
            ['ES', 'Espagne'],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {t(l)}
            </option>
          ))}
        </select>
      </label>
      <button className="secondary" onClick={() => onChange({})}>
        {t('Réinitialiser')}
      </button>
      {value.from && value.to && value.from > value.to ? (
        <p role="alert">{t('La première année doit précéder la dernière.')}</p>
      ) : null}
    </div>
  )
}

export function RandomPick({
  addons,
  library,
  onOpen,
}: {
  addons: Addon[]
  library: Meta[]
  onOpen: (m: Meta) => void
}) {
  const [filters, setFilters] = useState<DiscoveryFilters>({}),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Meta | null>(null),
    [message, setMessage] = useState('')
  const pool = useRef<{ key: string; items: Meta[] } | null>(null)
  const draw = async () => {
    setBusy(true)
    setMessage('')
    try {
      const key = JSON.stringify(addons),
        cached =
          pool.current?.key === key
            ? pool.current.items
            : await enrichDiscovery(addons, await discoveryPool(addons, '', library))
      pool.current = { key, items: cached }
      const items = cached.filter((m) => matchesDiscovery(m, filters))
      const choices = items.length > 1 ? items.filter((m) => m.id !== result?.id) : items
      if (!choices.length) {
        setResult(null)
        setMessage(t('Aucun titre ne correspond. Élargissez les critères ou ajoutez un catalogue.'))
        return
      }
      const random = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296
      setResult(choices[Math.floor(random * choices.length)])
    } catch {
      setMessage(t('Impossible de charger les catalogues. Réessayez.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="random-pick glass">
      <summary>{t('Je ne sais pas quoi regarder')}</summary>
      <DiscoveryControls type value={filters} onChange={setFilters} />
      <button className="primary" disabled={busy} onClick={() => void draw()}>
        {t(busy ? 'Recherche…' : result ? 'Une autre idée' : 'Surprenez-moi')}
      </button>
      <p className="muted">
        {t(
          'Tirage parmi vos catalogues chargés. Les critères exigent des métadonnées renseignées.',
        )}
      </p>
      {message && <p role="status">{message}</p>}
      {result && (
        <button className="random-result" onClick={() => onOpen(result!)}>
          {result.poster && <img src={result.poster} alt="" />}
          <span>
            <strong>{result.name}</strong>
            <small>
              {[
                result.releaseInfo,
                result.runtime,
                result.imdbRating && `IMDb ${result.imdbRating}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </span>
        </button>
      )}
    </details>
  )
}

export function SearchSuggestions({
  query,
  addons,
  library,
  collections,
  onSelect,
  onCollection,
  onOpen,
}: {
  query: string
  addons: Addon[]
  library: Meta[]
  collections: Collection[]
  onSelect: (s: string) => void
  onCollection: (id: string) => void
  onOpen: (m: Meta) => void
}) {
  const [items, setItems] = useState<Meta[]>([]),
    [open, setOpen] = useState(true)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.parentElement?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  useEffect(() => {
    let active = true
    setOpen(true)
    const timer = setTimeout(() => {
      if (query.trim().length < 2) {
        setItems([])
        return
      }
      void discoveryPool(addons, query, library).then((items) => {
        if (active)
          setItems(
            items
              .filter((m) => fuzzyScore(m.name, query) > 0)
              .sort((a, b) => fuzzyScore(b.name, query) - fuzzyScore(a.name, query))
              .slice(0, 6),
          )
      })
    }, 300)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, addons, library])
  if (!open || query.trim().length < 2 || Object.keys(parseDiscoveryQuery(query).filters).length)
    return null
  const local = library.filter((m) => fuzzyScore(m.name, query) > 0),
    titles = [...new Map([...local, ...items].map((m) => [m.id, m])).values()].slice(0, 6)
  const people = [
    ...new Set([...library, ...items].flatMap((m) => [...(m.cast ?? []), ...(m.director ?? [])])),
  ]
    .filter((p) => fuzzyScore(p, query) > 0)
    .slice(0, 3)
  const lists = collections.filter((c) => fuzzyScore(c.name, query) > 0).slice(0, 3)
  if (!titles.length && !people.length && !lists.length) return null
  return (
    <div
      ref={root}
      className="search-suggestions"
      aria-label={t('Suggestions de recherche')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setOpen(false)
          e.stopPropagation()
        }
      }}
    >
      {titles.map((m) => (
        <button
          key={m.type + m.id}
          onClick={() => {
            onSelect(m.name)
            setOpen(false)
            onOpen(m)
          }}
        >
          {m.name}
          <small>
            {t(matchesCategory(m, 'anime') ? 'Anime' : m.type === 'movie' ? 'Film' : 'Série')}
          </small>
        </button>
      ))}
      {people.map((p) => (
        <button
          key={p}
          onClick={() => {
            onSelect(p)
            setOpen(false)
          }}
        >
          {p}
          <small>{t('Acteurs et réalisateurs')}</small>
        </button>
      ))}
      {lists.map((c) => (
        <button
          key={c.id}
          onClick={() => {
            onCollection(c.id)
            setOpen(false)
          }}
        >
          {c.name}
          <small>{t('Collection')}</small>
        </button>
      ))}
      <button onClick={() => setOpen(false)}>{t('Fermer les suggestions')}</button>
    </div>
  )
}

export function UniversalSearch({
  query,
  addons,
  library,
  filters,
  renderItem,
  choice = 'all',
}: {
  query: string
  addons: Addon[]
  library: Meta[]
  filters: DiscoveryFilters
  choice?: string
  renderItem: (m: Meta) => ReactNode
}) {
  const [items, setItems] = useState<Meta[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false)
  const parsed = parseDiscoveryQuery(query),
    combined = {
      ...parsed.filters,
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')),
    }
  const signature = JSON.stringify(combined)
  useEffect(() => {
    let active = true
    setBusy(true)
    setError(false)
    setItems([])
    void (async () => {
      let pool = await discoveryPool(addons, parsed.query, library, combined.type, choice)
      const seeds = pool.filter((m) => fuzzyScore(m.name, parsed.query) > 0).slice(0, 3)
      if (parsed.similar || !pool.some((m) => fuzzyScore(m.name, parsed.query) > 0))
        pool = [...pool, ...(await discoveryPool(addons, '', [], combined.type, choice))]
      pool = await enrichDiscovery(addons, pool, 36)
      const unique = [...new Map(pool.map((m) => [m.type + ':' + m.id, m])).values()]
      const fullSeeds = unique.filter((m) => seeds.some((s) => s.id === m.id))
      const filtered = unique.filter(
        (m) =>
          matchesDiscovery(m, combined) &&
          (!parsed.query || parsed.similar
            ? !parsed.similar ||
              (!seeds.some((s) => s.id === m.id) && affinity(m, fullSeeds).score > 0)
            : fuzzyScore(m.name, parsed.query) > 0 ||
              [...(m.cast ?? []), ...(m.director ?? [])].some(
                (p) => fuzzyScore(p, parsed.query) > 0,
              )),
      )
      filtered.sort((a, b) =>
        parsed.similar
          ? affinity(b, fullSeeds).score - affinity(a, fullSeeds).score
          : fuzzyScore(b.name, parsed.query) - fuzzyScore(a.name, parsed.query),
      )
      if (active) setItems(filtered)
    })()
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [query, addons, library, signature, choice])
  return (
    <>
      <p className="muted">
        {t('Recherche dans les catalogues installés et les métadonnées disponibles.')}
      </p>
      {Object.keys(combined).length > 0 && (
        <p className="search-criteria">
          {[
            combined.type,
            combined.genre,
            combined.country,
            combined.from && `${combined.from}–${combined.to ?? '…'}`,
            combined.rating && `≥ ${combined.rating}`,
            combined.minutes && `≤ ${combined.minutes} min`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {busy ? (
        <p role="status">{t('Recherche…')}</p>
      ) : error ? (
        <p role="alert">{t('Impossible de charger les catalogues. Réessayez.')}</p>
      ) : items.length ? (
        (['movie', 'series', 'anime'] as const).map((type) => {
          const section = items.filter((m) => matchesCategory(m, type))
          return section.length ? (
            <section className="search-section" key={type}>
              <h2>
                {t(type === 'movie' ? 'Films' : type === 'anime' ? 'Animes' : 'Séries')}{' '}
                <small>{section.length}</small>
              </h2>
              <div className="poster-grid">{section.map(renderItem)}</div>
            </section>
          ) : null
        })
      ) : (
        <p>{t('Aucun résultat')}</p>
      )}
    </>
  )
}

export function VoiceSearch({ onResult }: { onResult: (value: string) => void }) {
  const [listening, setListening] = useState(false),
    [error, setError] = useState(''),
    current = useRef<any>(null)
  useEffect(() => () => current.current?.abort(), [])
  const start = async () => {
    if (isTauri()) {
      if (listening) return
      setListening(true)
      setError('')
      try {
        const text = await invoke<string>('voice_search', {
          language: document.documentElement.lang || 'en',
        })
        if (text) onResult(text)
      } catch {
        setError(t('Microphone indisponible ou autorisation refusée.'))
      } finally {
        setListening(false)
      }
      return
    }
    if (listening) {
      current.current?.stop()
      return
    }
    const Recognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!Recognition) {
      setError(
        t(
          'La reconnaissance vocale n’est pas disponible sur cet appareil. Utilisez le microphone du clavier.',
        ),
      )
      return
    }
    const recognition = new Recognition()
    current.current = recognition
    recognition.lang = document.documentElement.lang || 'en'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (e: any) => onResult(e.results[0][0].transcript)
    recognition.onend = () => setListening(false)
    recognition.onerror = () => {
      setListening(false)
      setError(t('Microphone indisponible ou autorisation refusée.'))
    }
    setError('')
    try {
      recognition.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }
  return (
    <div className="voice-search">
      <button
        className="secondary"
        aria-pressed={listening}
        disabled={isTauri() && listening}
        onClick={() => void start()}
      >
        {t(listening ? 'Écoute en cours…' : 'Recherche vocale')}
      </button>
      {error && <p role="status">{error}</p>}
    </div>
  )
}
