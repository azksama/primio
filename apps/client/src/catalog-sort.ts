import type { Meta, Settings } from './types'
export type CatalogSort = NonNullable<Settings['explorerSort']>
export const defaultSort: CatalogSort = { key: 'default', direction: 'desc' }
export function sortCatalog(items: Meta[], sort = defaultSort): Meta[] {
  if (sort.key === 'default') return sort.direction === 'desc' ? items : [...items].reverse()
  return [...items].sort((a, b) => {
    const direction = sort.direction === 'asc' ? 1 : -1
    if (sort.key === 'name')
      return (
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) * direction
      )
    const value = (m: Meta) =>
      sort.key === 'rating'
        ? Number.parseFloat(m.imdbRating?.replace(',', '.') ?? '')
        : Number.parseInt(m.releaseInfo ?? '')
    const av = value(a),
      bv = value(b)
    if (!Number.isFinite(av)) return Number.isFinite(bv) ? 1 : 0
    if (!Number.isFinite(bv)) return -1
    return (av - bv) * direction
  })
}
