import type { PrimioPlugin, WatchOrder } from '@primio/sdk'
import type { Meta, UserState } from './types'
import { collectionKey } from './library-key'

export function defaultWatchOrder(plugin: PrimioPlugin) {
  return plugin.permissions.includes('watchOrder')
    ? plugin.watchOrder?.find((order) => order.order === 'chronological') ?? plugin.watchOrder?.[0]
    : undefined
}
export async function watchCollectionId(plugin: PrimioPlugin) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plugin.id))
  return 'watch-' + Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
export function importWatchCollection(
  state: UserState, plugin: PrimioPlugin, order: WatchOrder, id: string, metas: Meta[] = [],
): UserState {
  if (!plugin.permissions.includes('watchOrder') || !plugin.watchOrder?.some((o) => o.id === order.id))
    throw Error('Ce plugin ne propose pas cet ordre de visionnage.')
  const existing = state.collections?.find((c) => c.id === id)
  if (!existing && (state.collections?.length ?? 0) >= 50) throw Error('Limite de 50 collections atteinte.')
  const known = new Map(state.library.map((m) => [collectionKey(m), m]))
  const full = new Map(metas.map((m) => [collectionKey(m), m]))
  // A collection contains titles. Episode-level entries collapse to their parent title.
  const items = [...new Set(order.entries.map(collectionKey))]
  const additions = order.entries.filter((entry) => {
    const key = collectionKey(entry)
    if (known.has(key)) return false
    known.set(key, entry)
    return true
  }).map((entry) => {
    const meta = full.get(collectionKey(entry))
    return { id: entry.id, type: entry.type, name: meta?.name ?? entry.name, poster: meta?.poster, category: meta?.category }
  })
  if (state.library.length + additions.length > 2000) throw Error('Limite de 2 000 titres atteinte.')
  const collection = {
    ...existing, id, name: existing?.name ?? plugin.name.slice(0, 60), icon: existing?.icon ?? 'film' as const,
    items: [...new Set([...items, ...(existing?.items ?? [])])].slice(0, 2000),
    sort: 'manual' as const, descending: false, sortRules: [{ key: 'manual' as const, direction: 'asc' as const }],
    rules: undefined, excluded: [], statusFilter: 'all' as const,
  }
  return { ...state, library: [...state.library, ...additions], collections: existing
    ? state.collections!.map((c) => c.id === id ? collection : c)
    : [...(state.collections ?? []), collection] }
}
