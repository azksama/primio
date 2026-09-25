import { useState, type Dispatch, type SetStateAction } from 'react'
import { FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { DialogShell } from './dialog-shell'
import { t } from './i18n'
import type { UserState, Meta } from './types'
export const collectionKey = (item: Pick<Meta, 'type' | 'id'>) =>
  JSON.stringify([item.type, item.id])
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
            <div className="collection-items">
              {state.library.map((m) => (
                <label className="import-addon" key={collectionKey(m)}>
                  <input
                    type="checkbox"
                    checked={items.includes(collectionKey(m))}
                    onChange={(e) =>
                      setItems((a) =>
                        e.target.checked
                          ? [...a, collectionKey(m)]
                          : a.filter((k) => k !== collectionKey(m)),
                      )
                    }
                  />
                  <span>{m.name}</span>
                </label>
              ))}
            </div>
            {!state.library.length && (
              <p className="muted">
                {t('Ajoutez des titres à Ma liste pour remplir cette collection.')}
              </p>
            )}
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
