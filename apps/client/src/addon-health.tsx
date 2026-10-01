import { useEffect, useState } from 'react'
import { inspectAddon } from './addons'
import { RefreshCw } from './icons'
import { t } from './i18n'

type Health = { state: 'checking' | 'online' | 'slow' | 'offline'; ms?: number; checkedAt?: number; successes: number; attempts: number }
export function useAddonHealth(addons: { url: string; enabled: boolean }[], active: boolean) {
  const [health, setHealth] = useState<Record<string, Health>>({})
  const [refreshId, setRefreshId] = useState(0)
  const key = JSON.stringify(addons.map(a => [a.url, a.enabled]))
  useEffect(() => {
    if (!active) return
    let cancelled = false, busy = false
    async function check() {
      if (busy || document.hidden) return
      busy = true
      const queue = addons.filter(a => a.enabled).slice(0, 50)
      await Promise.all(Array.from({ length: 3 }, async () => {
        for (let addon = queue.shift(); addon && !cancelled; addon = queue.shift()) {
          const url = addon.url, start = performance.now()
          setHealth(previous => ({ ...previous, [url]: { ...previous[url], state: 'checking', successes: previous[url]?.successes ?? 0, attempts: previous[url]?.attempts ?? 0 } }))
          let online = false
          try { await inspectAddon(url); online = true } catch { /* Never persist a configured addon URL in diagnostics. */ }
          const ms = Math.round(performance.now() - start)
          if (!cancelled) setHealth(previous => ({ ...previous, [url]: { state: online ? ms > 2500 ? 'slow' : 'online' : 'offline', ms, checkedAt: Date.now(), successes: (previous[url]?.successes ?? 0) + Number(online), attempts: (previous[url]?.attempts ?? 0) + 1 } }))
        }
      }))
      busy = false
    }
    void check()
    const timer = window.setInterval(() => void check(), 300000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [key, active, refreshId])
  return { health, refresh: () => setRefreshId(value => value + 1), busy: active && addons.some(addon => addon.enabled && health[addon.url]?.state === 'checking') }
}

export function AddonHealthStatus({ health, enabled }: { health?: Health; enabled: boolean }) {
  if (!enabled) return <small className="addon-health">{t('Désactivé')}</small>
  if (!health) return null
  const label = { checking: 'Vérification…', online: 'Disponible', slow: 'Réponse lente', offline: 'Indisponible' }[health.state]
  return <div className={'addon-health ' + health.state} role="status">
    {health.state === 'checking' && <RefreshCw size={12} />}<span>{t(label)}</span>
    {health.ms !== undefined && health.state !== 'checking' && <span>{health.ms} ms</span>}
    {health.attempts > 1 && health.state !== 'checking' && <small>{t('Disponibilité')} {Math.round(health.successes / health.attempts * 100)} % · {health.attempts} {t('vérifications')}</small>}
  </div>
}
