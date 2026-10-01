import { useEffect, useState } from 'react'
import { pluginSchema, type PrimioPlugin } from '@primio/sdk'
import { officialPlugins } from '@primio/sdk/catalog'
import { api } from './platform'

export type MarketplaceEntry = { manifest: PrimioPlugin; official: boolean; verified: boolean; featured: boolean }
export function comparePluginVersions(left: string, right: string) {
  const a = left.split('.').map(Number), b = right.split('.').map(Number)
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index]
  return 0
}
export function parseMarketplaceEntry(value: unknown): MarketplaceEntry | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>, manifest = pluginSchema.safeParse(row.manifest)
  if (!manifest.success || row.status !== 'published') return null
  return { manifest: manifest.data, official: row.official === true, verified: row.verified === true, featured: row.featured === true }
}
const bundled = officialPlugins.map(manifest => ({ manifest, official: true, verified: true, featured: false }))
export function useMarketplace() {
  const [entries, setEntries] = useState<MarketplaceEntry[]>(bundled)
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline'>('loading')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true, running = false
    async function refresh() {
      if (running || document.hidden) return
      running = true
      try {
        const items: MarketplaceEntry[] = []
        for (let page = 1; page <= 10; page++) {
          const result = await api<{ items: unknown[]; total: number; perPage: number }>(`/marketplace?page=${page}`)
          if (!Array.isArray(result.items) || result.items.length > 60) throw Error('Invalid marketplace response')
          items.push(...result.items.map(parseMarketplaceEntry).filter((item): item is MarketplaceEntry => !!item))
          if (page * result.perPage >= result.total || !result.items.length) break
        }
        if (active) { setEntries(items); setStatus('ready') }
      } catch { if (active) setStatus('offline') }
      finally { running = false }
    }
    void refresh()
    const tick = window.setInterval(() => void refresh(), 300000)
    const visible = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; clearInterval(tick); document.removeEventListener('visibilitychange', visible) }
  }, [retry])
  return { entries, status, refresh: () => { setStatus('loading'); setRetry(n => n + 1) } }
}
