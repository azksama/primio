import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { FolderPlus, Pencil, Trash2, Check } from 'lucide-react'
import { DialogShell } from './dialog-shell'
import { t } from './i18n'
import type { UserState, Meta } from './types'
export const collectionKey = (item: Pick<Meta, 'type' | 'id'>) =>
  JSON.stringify([item.type, item.id])

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
            c.id === id ? { ...c, items: [...new Set([...c.items, ...items])].slice(0, 2000) } : c,
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
            <small>{c.items.length}</small>
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
}: {
  state: UserState
  setState: Dispatch<SetStateAction<UserState>>
  selected: string
  onSelect: (id: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(''),
    [items, setItems] = useState<string[]>([])
  const collections = state.collections ?? []
  const edit = (id: string) => {
    const c = collections.find((c) => c.id === id)
    setEditing(id)
    setName(c?.name ?? '')
    setItems(c?.items ?? [])
  }
  return (
    <section className="collections">
      <div className="chips" aria-label={t('Collections')}>
        <button aria-pressed={!selected} onClick={() => onSelect('')}>
          {t('Tous')}
        </button>
        {collections.map((c) => (
          <button key={c.id} aria-pressed={selected === c.id} onClick={() => onSelect(c.id)}>
            {c.name} <small>{c.items.length}</small>
          </button>
        ))}
        <button disabled={collections.length >= 50} onClick={() => edit('new')}>
          <FolderPlus size={18} />
          {t('Créer une collection')}
        </button>
        {selected && collections.some((c) => c.id === selected) && (
          <button aria-label={t('Modifier la collection')} onClick={() => edit(selected)}>
            <Pencil size={18} />
          </button>
        )}
      </div>
      {editing !== null && (
        <DialogShell title={t('Collection')} onClose={() => setEditing(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              const id = editing === 'new' ? crypto.randomUUID() : editing
              setState((s) => ({
                ...s,
                collections: [
                  ...(s.collections ?? []).filter((c) => c.id !== id),
                  { id, name: name.trim(), items },
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
            <div className="collection-actions">
              <button className="primary" type="submit">
                {t('Enregistrer')}
              </button>
              {editing !== 'new' && (
                <button
                  type="button"
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
                  {t('Supprimer la collection')}
                </button>
              )}
            </div>
          </form>
        </DialogShell>
      )}
    </section>
  )
}
