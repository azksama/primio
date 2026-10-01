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
import { genreLabel } from './genres'
import { t, locale } from './i18n'
import { discoveryService } from './random-discovery'
import { Choice } from './components'
import { tmdbToken } from './metadata-provider'
import { Shuffle, SlidersHorizontal, ChevronDown, ArrowRight, LoaderCircle, Mic } from './icons'

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
            aria-label={t('Type')}
            value={value.type ?? ''}
            onChange={(e) => onChange({ ...value, type: e.target.value, genre: undefined })}
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
            aria-label={t('Genre')}
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
            ].filter(g => value.type !== 'series' || !['Horror','Romance','Thriller'].includes(g)).map((g) => (
              <option key={g} value={g}>
                {g ? genreLabel(g) : t('Tous')}
              </option>
            ))}
          </select>
        </label>
      )}
      {numeric('from', 'Année minimum', 1900, 2100)}
      {numeric('to', 'Année maximum', 1900, 2100)}
      {numeric('rating', 'Note minimale', 0, 10, 0.5)}
      {numeric('minutes', 'Durée maximum (min)', 1, 600)}
      <Choice separateLabel label={t('Pays')} value={value.country ?? ''}
        onChange={country => onChange({ ...value, country })}
        options={[
            ['', 'Tous'],
            ['JP', 'Japon'],
            ['KR', 'Corée du Sud'],
            ['CN', 'Chine'],
            ['US', 'États-Unis'],
            ['FR', 'France'],
            ['GB', 'Royaume-Uni'],
            ['DE', 'Allemagne'],
            ['ES', 'Espagne'],
          ].map(([v, l]) => [v, t(l)] as [string, string])} />
      <button className="secondary" onClick={() => onChange({})}>
        {t('Réinitialiser')}
      </button>
      {value.from && value.to && value.from > value.to ? (
        <p role="alert">{t('La première année doit précéder la dernière.')}</p>
      ) : null}
    </div>
  )
}

export function AdvancedFilters({ value, onChange, open, onToggle }: {
  value: DiscoveryFilters; onChange: (v: DiscoveryFilters) => void; open?: boolean; onToggle?: (open: boolean) => void
}) {
  const count = Object.values(value).filter(v => v !== undefined && v !== '').length
  if (open !== undefined) return open ? <section className="advanced-filter-panel search-filter-panel" id="advanced-search-filters" aria-label={t('Filtres avancés')}><DiscoveryControls value={value} onChange={onChange} /></section> : null
  return <details className="advanced-discover" onToggle={event => onToggle?.(event.currentTarget.open)}>
    <summary><SlidersHorizontal size={18} /><span>{t('Filtres avancés')}</span>
      {count > 0 && <span className="filter-count">{count}</span>}<ChevronDown size={16} />
    </summary>
    <div className="advanced-filter-panel"><DiscoveryControls value={value} onChange={onChange} /></div>
  </details>
}

export function RandomPick({ onOpen, onConfigure, accountId }: { onOpen: (m: Meta) => void; onConfigure: () => void; accountId: string }) {
  const [filters, setFilters] = useState<DiscoveryFilters>({}),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Meta | null>(null),
    [message, setMessage] = useState(''),
    [criteria, setCriteria] = useState(false),
    [configured, setConfigured] = useState<boolean | null>(null)
  useEffect(() => {
    let active = true
    const refresh = () => { void tmdbToken(accountId).then(value => { if (active) setConfigured(!!value) }).catch(() => { if (active) setConfigured(false) }) }
    refresh(); window.addEventListener('primio-metadata-changed', refresh)
    return () => { active = false; window.removeEventListener('primio-metadata-changed', refresh) }
  }, [accountId])
  const recent = useRef<string[]>([])
  const invalidYears = !!(filters.from && filters.to && filters.from > filters.to)
  const draw = async () => {
    if (busy || invalidYears) return
    setBusy(true); setMessage('')
    try {
      const body = Object.fromEntries(Object.entries(filters).filter(([,v]) => v !== '' && v !== undefined))
      const token = await tmdbToken(accountId)
      setConfigured(!!token)
      const data = await discoveryService(token)({
        ...body, language: locale(), exclude: recent.current.slice(-20),
      })
      setResult(data.item)
      if (data.item) recent.current = [...recent.current, data.item.id].slice(-20)
      else setMessage(t('Aucun titre ne correspond. Essayez des critères plus larges.'))
    } catch (error) {
      const code = (error as { code?: string }).code
      setMessage(t(code === 'TMDB_NOT_CONFIGURED'
        ? 'Ajoutez votre jeton TMDB pour découvrir des films et des séries.'
        : code === 'TMDB_INVALID_TOKEN'
          ? 'Votre jeton TMDB a expiré ou est invalide. Remplacez-le dans les paramètres.'
        : code === 'PROVIDER_BUSY'
          ? 'La recherche est très sollicitée. Réessayez dans un instant.'
          : 'Impossible de trouver une suggestion. Réessayez.'))
    } finally { setBusy(false) }
  }
  return <section className="random-pick" aria-label={t('Je ne sais pas quoi regarder')}>
    <div className="random-heading">
      <div className="random-copy"><span className="eyebrow">{t('À votre tour de découvrir')}</span>
        <h2>{t('Je ne sais pas quoi regarder')}</h2>
        <p>{t('Un film, une série ou un anime pour ce soir.')}</p>
      </div>
      <button className="random-draw" disabled={busy || invalidYears} onClick={() => void draw()}>
        {busy ? <LoaderCircle className="spin" size={21} /> : <Shuffle size={21} />}
        <span>{t(busy ? 'Recherche…' : result ? 'Une autre idée' : 'Surprenez-moi')}</span>
      </button>
    </div>
    <button className="random-criteria" aria-expanded={criteria} aria-controls="random-criteria" onClick={() => setCriteria(!criteria)}>
      <SlidersHorizontal size={17} /><span>{t('Affiner mes envies')}</span><ChevronDown size={15} />
    </button>
    <fieldset id="random-criteria" hidden={!criteria} disabled={busy}><DiscoveryControls type value={filters} onChange={value => { setFilters(value); setResult(null); setMessage('') }} /></fieldset>
    {message && <p className="discovery-message" role="status">{message}</p>}
    {configured === false && <div className="random-provider"><span>{t('Animes via AniList. Films et séries avec votre jeton TMDB.')}</span><button onClick={onConfigure}>{t('Configurer TMDB')}<ArrowRight size={15} /></button></div>}
    {result && <button className="random-result" onClick={() => onOpen(result)}>
      {result.poster && <img src={result.poster} alt="" />}
      <span><strong>{result.name}</strong>
        <small>{[result.releaseInfo, result.runtime,
          result.rating && `${result.ratingSource} ${result.rating}/10`].filter(Boolean).join(' · ')}</small>
        <span className="random-open">{t('Voir la fiche')} <ArrowRight size={16} /></span>
      </span>
    </button>}
  </section>
}

export function SearchSuggestions({
  category,
  filters = {},
  query,
  addons,
  library,
  collections,
  onSelect,
  onCollection,
  onOpen,
}: {
  category?: string
  filters?: DiscoveryFilters
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
  const criteria = { ...filters, ...(category ? { type: category } : {}) }
  const signature = JSON.stringify(criteria)
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
      void discoveryPool(addons, query, library, category).then((items) => {
        if (active)
          setItems(
            items
              .filter((m) => fuzzyScore(m.name, query) > 0 && matchesDiscovery(m, criteria))
              .sort((a, b) => fuzzyScore(b.name, query) - fuzzyScore(a.name, query))
              .slice(0, 6),
          )
      }).catch(() => { if (active) setItems([]) })
    }, 300)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, addons, library, category, signature])
  if (!open || query.trim().length < 2 || Object.keys(parseDiscoveryQuery(query).filters).length)
    return null
  const local = library.filter((m) => fuzzyScore(m.name, query) > 0 && matchesDiscovery(m, criteria)),
    titles = [...new Map([...local, ...items].filter(m => matchesDiscovery(m, criteria)).map((m) => [m.type + ':' + m.id, m])).values()].slice(0, 6)
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
            combined.genre && genreLabel(combined.genre),
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
    <div className="voice-search inline-voice-search">
      <button
        className="icon search-microphone"
        type="button"
        aria-label={t(listening ? 'Écoute en cours…' : 'Recherche vocale')}
        title={t(listening ? 'Écoute en cours…' : 'Recherche vocale')}
        aria-pressed={listening}
        disabled={isTauri() && listening}
        onClick={() => void start()}
      >
        {listening ? <LoaderCircle size={20} className="spin" /> : <Mic size={20} />}
      </button>
      {error && <p role="status">{error}</p>}
    </div>
  )
}
