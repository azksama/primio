import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  FolderPlus,
  Pencil,
  Trash2,
  Check,
  Star,
  Heart,
  Clapperboard,
  Sparkles,
  Bookmark,
  X,
} from './icons'
import { DialogShell } from './dialog-shell'
import { Choice } from './components'
import { CollectionRulesEditor, CollectionSorting, newRules } from './collection-rule-editor'
import { collectionMembers, needsCollectionMetadata, validRules } from './collection-rules'
import { useCollectionMetadata } from './collection-metadata'
import { collectionKey } from './library-key'
import { t } from './i18n'
import type { UserState, Addon, Collection, CollectionRules, CollectionSort } from './types'
export { collectionKey } from './library-key'
const collectionIcons = {
  folder: FolderPlus,
  star: Star,
  heart: Heart,
  film: Clapperboard,
  anime: Sparkles,
  bookmark: Bookmark,
}
export function CollectionIcon({ name }: { name?: string }) {
  const Icon = collectionIcons[name as keyof typeof collectionIcons]
  return Icon ? <Icon size={18} /> : null
}
export function SelectablePoster({
  children,
  label,
  selected,
  selecting,
  onSelect,
  onOpen,
}: {
  children: ReactNode
  label: string
  selected: boolean
  selecting: boolean
  onSelect: () => void
  onOpen: () => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const origin = useRef({ x: 0, y: 0 }),
    held = useRef(false)
  const cancel = () => {
    clearTimeout(timer.current)
    timer.current = undefined
  }
  useEffect(() => cancel, [])
  return (
    <button
      className={'poster selectable-poster' + (selected ? ' is-selected' : '')}
      aria-label={label}
      aria-pressed={selecting ? selected : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        cancel()
        held.current = false
        origin.current = { x: e.clientX, y: e.clientY }
        timer.current = setTimeout(() => {
          held.current = true
          onSelect()
        }, 500)
      }}
      onPointerMove={(e) => {
        if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 10) cancel()
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => {
        e.preventDefault()
        cancel()
        if (!held.current) {
          held.current = true
          onSelect()
        }
      }}
      onClick={() => {
        cancel()
        if (held.current) {
          held.current = false
          return
        }
        selecting ? onSelect() : onOpen()
      }}
    >
      {children}
      {selecting && (
        <span className="poster-selection" aria-hidden="true">
          {selected && <Check size={18} />}
        </span>
      )}
    </button>
  )
}

export function AddToCollection({
  state,
  setState,
  items,
  onClose,
}: {
  state: UserState
  setState: Dispatch<SetStateAction<UserState>>
  items: string[]
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const add = (id: string, name?: string) => {
    setState((s) => ({
      ...s,
      collections: name
        ? [...(s.collections ?? []), { id, name, items: [...new Set(items)] }]
        : (s.collections ?? []).map((c) =>
            c.id === id
              ? {
                  ...c,
                  items: [...new Set([...c.items, ...items])].slice(0, 2000),
                  excluded: c.excluded?.filter((key) => !items.includes(key)),
                }
              : c,
          ),
    }))
    onClose()
  }
  return (
    <DialogShell title={t('Ajouter à une collection')} onClose={onClose}>
      <div className="collection-destinations">
        {(state.collections ?? []).map((c) => (
          <button key={c.id} onClick={() => add(c.id)}>
            {c.name}
            <small>{c.rules ? t('Automatique') : c.items.length}</small>
          </button>
        ))}
      </div>
      {(state.collections ?? []).length < 50 && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) add(crypto.randomUUID(), name.trim())
          }}
        >
          <label className="field">
            {t('Nouvelle collection')}
            <input value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="primary" disabled={!name.trim()}>
            {t('Créer et ajouter')}
          </button>
        </form>
      )}
    </DialogShell>
  )
}
export function Collections({
  state,
  setState,
  selected,
  onSelect,
  metas,
  addons,
}: {
  state: UserState
  setState: Dispatch<SetStateAction<UserState>>
  selected: string
  onSelect: (id: string) => void
  metas: import('./types').Meta[]
  addons: Addon[]
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(''),
    [items, setItems] = useState<string[]>([])
  const [icon, setIcon] = useState('')
  const [automatic, setAutomatic] = useState(false)
  const [rules, setRules] = useState<CollectionRules>(newRules)
  const [sorts, setSorts] = useState<CollectionSort[]>([{ key: 'manual', direction: 'asc' }])
  const collections = state.collections ?? []
  const enrichment = useCollectionMetadata(
    state.library,
    addons,
    editing !== null && automatic && needsCollectionMetadata(rules),
  )
  const enriched = [...metas, ...enrichment.metas]
  const current = collections.find((c) => c.id === editing)
  const preview = collectionMembers(
    {
      id: editing ?? '',
      name,
      items,
      excluded: current?.excluded,
      rules: automatic ? rules : undefined,
    },
    state.library,
    enriched,
    state.progress,
    state.settings,
  )
  const edit = (id: string) => {
    const c = collections.find((c) => c.id === id)
    setEditing(id)
    setName(c?.name ?? '')
    setIcon(c?.icon ?? '')
    setItems(c?.items ?? [])
    setAutomatic(!!c?.rules)
    setRules(c?.rules ?? newRules())
    setSorts(
      c?.sortRules?.length
        ? c.sortRules
        : [{ key: c?.sort ?? 'manual', direction: c?.descending ? 'desc' : 'asc' }],
    )
  }
  return (
    <section className="collections">
      <div className="collection-toolbar explorer-filters">
        <Choice
          separateLabel
          label={t('Collection')}
          value={collections.some((c) => c.id === selected) ? selected : ''}
          options={[
            ['', t('Tous') + ' · ' + state.library.length],
            ...collections.map(
              (c) =>
                [
                  c.id,
                  c.name +
                    ' · ' +
                    collectionMembers(c, state.library, metas, state.progress, state.settings)
                      .length,
                ] as [string, string],
            ),
          ]}
          onChange={onSelect}
        />
        <button
          className="icon glass"
          disabled={collections.length >= 50}
          aria-label={t('Créer une collection')}
          title={t('Créer une collection')}
          onClick={() => edit('new')}
        >
          <FolderPlus size={20} />
        </button>
        {selected && collections.some((c) => c.id === selected) && (
          <button
            className="icon glass"
            aria-label={t('Modifier la collection')}
            title={t('Modifier la collection')}
            onClick={() => edit(selected)}
          >
            <Pencil size={18} />
          </button>
        )}
      </div>
      {editing !== null && (
        <DialogShell title={t('Collection')} className="collection-dialog" onClose={() => setEditing(null)}>
          <div className="dialog-head">
            <h2>{t(editing === 'new' ? 'Créer une collection' : 'Modifier la collection')}</h2>
            <button
              type="button"
              className="icon glass"
              aria-label={t('Fermer')}
              onClick={() => setEditing(null)}
            >
              <X size={20} />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim() || (automatic && !validRules(rules))) return
              const id = editing === 'new' ? crypto.randomUUID() : editing
              setState((s) => ({
                ...s,
                collections: [
                  ...(s.collections ?? []).filter((c) => c.id !== id),
                  {
                    ...s.collections?.find((c) => c.id === id),
                    id,
                    name: name.trim(),
                    items,
                    icon: (icon || undefined) as Collection['icon'],
                    rules: automatic ? rules : undefined,
                    sortRules: sorts,
                    sort: sorts[0].key,
                    descending: sorts[0].direction === 'desc',
                  },
                ],
              }))
              onSelect(id)
              setEditing(null)
            }}
          >
            <label className="field">
              {t('Nom')}
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
              />
            </label>
            <div
              className="collection-mode"
              role="group"
              aria-label={t('Remplissage de la collection')}
            >
              <button type="button" aria-pressed={!automatic} onClick={() => setAutomatic(false)}>
                {t('Manuel')}
              </button>
              <button type="button" aria-pressed={automatic} onClick={() => setAutomatic(true)}>
                {t('Automatique')}
              </button>
            </div>
            {!automatic && (
              <p className="muted">
                {t('Ajoutez des titres avec un appui prolongé dans Ma liste.')}
              </p>
            )}
            {automatic && (
              <CollectionRulesEditor rules={rules} onChange={setRules} metas={enriched} />
            )}
            <div className="collection-preview" aria-live="polite" aria-busy={enrichment.loading}>
              <strong>
                {t('Aperçu')} ·{' '}
                {t(preview.length === 1 ? '{n} titre' : '{n} titres', { n: preview.length })}
              </strong>
              {enrichment.loading && <small>{t('Analyse des métadonnées…')}</small>}
              {preview.length > 0 && (
                <ul>
                  {preview.slice(0, 5).map((m) => (
                    <li key={collectionKey(m)}>{m.name}</li>
                  ))}
                </ul>
              )}
              {!preview.length && <p>{t('Aucun titre ne correspond pour le moment.')}</p>}
              {automatic && items.length > 0 && (
                <small>{t('Les titres ajoutés manuellement restent inclus.')}</small>
              )}
              {!!enrichment.failed && (
                <small>
                  {t(
                    'Certaines métadonnées sont indisponibles. Les critères concernés attendront leur chargement.',
                  )}
                </small>
              )}
              {automatic && !validRules(rules) && (
                <small role="status">
                  {t('Complétez les conditions pour enregistrer la collection.')}
                </small>
              )}
            </div>
            <details className="collection-extra">
              <summary>{t('Ordre d’affichage')}</summary>
              <CollectionSorting sorts={sorts} onChange={setSorts} />
            </details>
            <details className="collection-extra">
              <summary>
                {t('Icône (facultatif)')} <CollectionIcon name={icon} />
              </summary>
              <fieldset className="collection-icon-picker">
                <legend>{t('Icône (facultatif)')}</legend>
                <button type="button" aria-pressed={!icon} onClick={() => setIcon('')}>
                  {t('Aucune')}
                </button>
                {Object.keys(collectionIcons).map((key) => (
                  <button
                    type="button"
                    key={key}
                    aria-label={t(
                      {
                        folder: 'Dossier',
                        star: 'Étoile',
                        heart: 'Cœur',
                        film: 'Film',
                        anime: 'Anime',
                        bookmark: 'Marque-page',
                      }[key] ?? key,
                    )}
                    aria-pressed={icon === key}
                    onClick={() => setIcon(key)}
                  >
                    <CollectionIcon name={key} />
                  </button>
                ))}
              </fieldset>
            </details>
            <div className="collection-actions">
              <button
                className="primary"
                type="submit"
                disabled={!name.trim() || (automatic && !validRules(rules))}
              >
                {t('Enregistrer')}
              </button>
              {editing !== 'new' && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setState((s) => ({
                      ...s,
                      collections: (s.collections ?? []).filter((c) => c.id !== editing),
                    }))
                    onSelect('')
                    setEditing(null)
                  }}
                >
                  <Trash2 size={18} />
                  {t('Supprimer')}
                </button>
              )}
            </div>
          </form>
        </DialogShell>
      )}
    </section>
  )
}
