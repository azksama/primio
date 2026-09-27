import { useState } from 'react'
import { definePlugin, type PrimioPlugin, type WatchOrder } from '@primio/sdk'
import type { Meta, Progress } from './types'
import { Check, ChevronRight } from './icons'
import { isWatched } from './progress'
import { t } from './i18n'

export function WatchOrders({
  plugins,
  progress,
  meta,
  onOpen,
}: {
  plugins: PrimioPlugin[]
  progress: Progress[]
  meta?: Meta
  onOpen: (m: Meta) => void
}) {
  const lists = plugins
    .filter((p) => p.enabled !== false && p.permissions.includes('watchOrder'))
    .flatMap((p) => (p.watchOrder ?? []).map((order) => ({ ...order, id: p.id + ':' + order.id })))
    .filter((o) => !meta || o.entries.some((e) => e.id === meta.id))
  const [selected, setSelected] = useState('')
  const current = lists.find((l) => l.id === selected) ?? lists[0]
  if (!current) return null
  const watched = (entry: WatchOrder['entries'][number]) =>
    entry.type === 'movie' || entry.videoId
      ? progress.some(
          (p) => p.type === entry.type && p.videoId === (entry.videoId ?? entry.id) && isWatched(p),
        )
      : false
  return (
    <section className="watch-order">
      <h2>{t('Ordre de visionnage')}</h2>
      <label className="watch-order-choice">
        {t('Parcours')}
        <select value={current.id} onChange={(e) => setSelected(e.target.value)}>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {t(l.title)}
            </option>
          ))}
        </select>
      </label>
      {current.description && <p>{t(current.description)}</p>}
      <ol>
        {current.entries.map((entry, index) => (
          <li key={entry.id + ':' + (entry.videoId ?? index)}>
            <button className="row unlined" onClick={() => onOpen(entry)}>
              <span className="watch-step">{watched(entry) ? <Check size={18} /> : index + 1}</span>
              <span className="grow">
                {entry.name}
                {entry.optional && <small> · {t('Facultatif')}</small>}
              </span>
              <ChevronRight size={18} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function WatchOrderBuilder({
  library,
  onInstall,
}: {
  library: Meta[]
  onInstall: (p: PrimioPlugin) => void
}) {
  const [name, setName] = useState(''),
    [ids, setIds] = useState<string[]>([])
  const key = (m: Meta) => JSON.stringify([m.type, m.id]),
    items = ids.flatMap((id) => library.filter((m) => key(m) === id))
  const move = (index: number, direction: number) =>
    setIds((previous) => {
      const next = [...previous],
        target = index + direction
      if (target < 0 || target >= next.length) return next
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  return (
    <details className="advanced-discover">
      <summary>{t('Créer un ordre de visionnage')}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || !items.length) return
          onInstall(
            definePlugin({
              schemaVersion: 2,
              id: 'personal.order-' + crypto.randomUUID(),
              name: name.trim(),
              description: 'Personal viewing order',
              author: 'You',
              version: '1.0.0',
              category: 'library',
              permissions: ['watchOrder'],
              watchOrder: [
                {
                  id: 'custom',
                  title: name.trim(),
                  order: 'custom',
                  entries: items.map((m) => ({
                    id: m.id,
                    type: m.type === 'movie' ? 'movie' : m.type === 'anime' ? 'anime' : 'series',
                    name: m.name.slice(0, 200),
                  })),
                },
              ],
            }),
          )
          setName('')
          setIds([])
        }}
      >
        <label className="field">
          {t('Nom')}
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </label>
        <label className="field">
          {t('Ajouter un titre')}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) setIds((old) => [...old, e.target.value])
            }}
          >
            <option value="">{t('Choisir dans ma liste')}</option>
            {library
              .filter((m) => !ids.includes(key(m)))
              .map((m) => (
                <option key={key(m)} value={key(m)}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
        <ol className="custom-watch-order">
          {items.map((m, index) => (
            <li key={key(m)}>
              <span>
                {index + 1}. {m.name}
              </span>
              <button
                type="button"
                disabled={!index}
                aria-label={t('Monter') + ' ' + m.name}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === items.length - 1}
                aria-label={t('Descendre') + ' ' + m.name}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={t('Retirer') + ' ' + m.name}
                onClick={() => setIds((old) => old.filter((id) => id !== key(m)))}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
        <button className="primary" disabled={!items.length || items.length > 200}>
          {t('Enregistrer')}
        </button>
      </form>
    </details>
  )
}
