import { catalog } from './addons'
import type { Addon, Manifest, Meta } from './types'

export interface CatalogTarget {
  addon: Addon
  catalog: NonNullable<Manifest['catalogs']>[number]
  anime?: boolean
}
export function catalogTargets(
  addons: Addon[],
  type: string,
  choice: string,
  query: string,
  anime = false,
  genre = '',
  includeRequired = false,
): CatalogTarget[] {
  return addons
    .filter((a) => a.enabled)
    .flatMap((addon) =>
      (addon.manifest.catalogs ?? [])
        .filter(
          (c) =>
            (anime
              ? c.type === 'anime' ||
                /anime|kitsu|anilist|myanimelist/i.test(
                  [addon.manifest.id, addon.manifest.name, c.id, c.name].join(' '),
                )
              : c.type === type) &&
            (choice === 'all' || choice === addon.url + '|' + c.type + '|' + c.id) &&
            (!query || c.extra?.some((e) => e.name === 'search')) &&
            (!genre ||
              c.extra?.some(
                (e) => e.name === 'genre' && (!e.options?.length || e.options.includes(genre)),
              )) &&
            (includeRequired ||
              !c.extra?.some(
                (e) =>
                  e.isRequired && !(e.name === 'search' && query) && !(e.name === 'genre' && genre),
              )),
        )
        .map((c) => ({ addon, catalog: c, anime })),
    )
}

// Each provider owns its offset; merged/deduplicated counts must never become API offsets.
export function createCatalogPager(
  targets: CatalogTarget[],
  query: string,
  fetchPage = catalog,
  genre = '',
) {
  const queue = targets.map((target) => ({ ...target, offset: 0, seen: new Set<string>() }))
  const items = new Map<string, Meta>()
  let pending: Promise<{ items: Meta[]; hasMore: boolean; failed: boolean }> | undefined
  async function batch() {
    const selected = queue.splice(0, 3)
    const responses = await Promise.allSettled(
      selected.map((target) =>
        fetchPage(target.addon, target.catalog.type, target.catalog.id, {
          ...(query ? { search: query } : {}),
          ...(genre ? { genre } : {}),
          ...(target.offset ? { skip: String(target.offset) } : {}),
        }),
      ),
    )
    let failed = false
    responses.forEach((response, index) => {
      const target = selected[index]
      if (response.status === 'rejected') {
        failed = true
        queue.push(target)
        return
      }
      let fresh = 0
      for (const meta of response.value) {
        const key = meta.type + ':' + meta.id
        if (!target.seen.has(key)) fresh++
        target.seen.add(key)
        if (!items.has(key)) items.set(key, target.anime ? { ...meta, category: 'anime' } : meta)
      }
      target.offset += response.value.length
      // Stremio defines pages of 100. A repeated page also ends a broken provider's feed.
      if (
        response.value.length >= 100 &&
        fresh > 0 &&
        target.catalog.extra?.some((e) => e.name === 'skip')
      )
        queue.push(target)
    })
    return { items: [...items.values()], hasMore: queue.length > 0, failed }
  }
  return {
    load() {
      pending ??= batch().finally(() => {
        pending = undefined
      })
      return pending
    },
  }
}
