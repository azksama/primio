import { useEffect, useState } from 'react'
import { metadata } from './addons'
import { collectionKey } from './library-key'
import type { Addon, Meta } from './types'

const cache = new Map<string, { at: number; meta: Meta }>()
export function useCollectionMetadata(library: Meta[], addons: Addon[], enabled: boolean) {
  const [result, setResult] = useState<{
    scope: string
    metas: Meta[]
    loading: boolean
    failed: number
  }>({ scope: '', metas: [], loading: false, failed: 0 })
  const scope = JSON.stringify([addons.map((a) => [a.url, a.enabled]), library.map(collectionKey)])
  useEffect(() => {
    if (!enabled) return
    let active = true,
      index = 0,
      failed = 0
    const prefix = JSON.stringify(addons.map((a) => [a.url, a.enabled]))
    const found: Meta[] = []
    const pending = library.filter((m) => {
      const saved = cache.get(prefix + collectionKey(m))
      if (saved && Date.now() - saved.at < 6 * 3600000) {
        found.push(saved.meta)
        return false
      }
      return true
    })
    setResult({ scope, metas: [...found], loading: pending.length > 0, failed: 0 })
    const work = async () => {
      while (active && index < pending.length) {
        const m = pending[index++]
        try {
          const full = await metadata(addons, m)
          if (full.metadataStatus === 'unavailable') failed++
          else {
            if (cache.size >= 2500) cache.delete(cache.keys().next().value!)
            cache.set(prefix + collectionKey(m), { at: Date.now(), meta: full })
            found.push(full)
          }
        } catch {
          failed++
        }
        if (active) setResult({ scope, metas: [...found], loading: true, failed })
      }
    }
    void Promise.all(Array.from({ length: 4 }, work)).finally(() => {
      if (active) setResult({ scope, metas: [...found], loading: false, failed })
    })
    return () => {
      active = false
    }
  }, [scope, enabled])
  return enabled && result.scope === scope ? result : { metas: [], loading: enabled, failed: 0 }
}
