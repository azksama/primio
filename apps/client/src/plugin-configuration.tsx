import type { PrimioPlugin } from '@primio/sdk'
import { Choice, Toggle } from './components'
import { OledAccentPicker } from './accent-picker'
import { defaultWatchOrder } from './watch-collections'
import { FolderPlus } from './icons'
import { t } from './i18n'
import type { Settings } from './types'

export const configurablePlugin = (p: PrimioPlugin) =>
  (p.id === 'primio.oled' && !!p.theme && p.permissions.includes('theme')) || !!(p.sources || p.layout || p.accessibility || p.spoilers || p.watchOrder || p.pages?.length || p.addons?.length)

function WatchCollectionSettings({ plugin, orderId, onOrder }: { plugin: PrimioPlugin; orderId: string; onOrder: (id: string) => void }) {
  const orders = plugin.watchOrder ?? [], order = orders.find((o) => o.id === orderId) ?? defaultWatchOrder(plugin)
  if (!order) return null
  return <div className="watch-collection-settings">
    <p className="muted">{t('Ajoutez les {count} titres de ce parcours à une collection dans Ma liste.', { count: new Set(order.entries.map(e => JSON.stringify([e.type, e.id]))).size })}</p>
    {orders.length > 1 && <Choice floating separateLabel label={t('Ordre de visionnage')} value={order.id} options={orders.map(o => [o.id, t(o.order === 'chronological' ? 'Chronologique' : o.order === 'release' ? 'Ordre de sortie' : 'Personnalisé')])} onChange={onOrder} />}
    {orders.length === 1 && <p className="plugin-order-label">{t(order.order === 'chronological' ? 'Ordre chronologique' : order.order === 'release' ? 'Ordre de sortie' : 'Ordre personnalisé')}</p>}
    <p className="muted">{t('Enregistrer crée ou actualise cette collection.')}</p>
    <small>{t('La collection reste modifiable, même si vous désinstallez le plugin.')}</small>
  </div>
}
export function PluginConfiguration({ plugin: p, settings, onSettings, onUpdate, orderId, onOrder, onOpenPage, onAddon }: {
  plugin: PrimioPlugin; settings: Settings; onSettings: (settings: Settings) => void; onUpdate: (plugin: PrimioPlugin) => void;
  orderId: string; onOrder: (id: string) => void; onOpenPage: (id: string) => void; onAddon: (manifest: string) => void;
}) {
  return <>
    {p.id === 'primio.oled' && p.theme && p.permissions.includes('theme') && <OledAccentPicker staged active={p.enabled !== false} value={settings.oledAccent} onChange={oledAccent => onSettings({ ...settings, oledAccent })} />}
    {p.watchOrder && p.permissions.includes('watchOrder') && <WatchCollectionSettings plugin={p} orderId={orderId} onOrder={onOrder} />}
    {p.sources && p.permissions.includes('sources') && <div className="plugin-fields">{(['prefer', 'hide'] as const).map(key => <label className="field" key={key}>
      {t(key === 'prefer' ? 'Mots à privilégier' : 'Mots à masquer')}
      <input defaultValue={p.sources?.[key]?.join(', ') ?? ''} maxLength={1600} onChange={e => onUpdate({ ...p, sources: { ...p.sources, [key]: e.target.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20).map(s => s.slice(0, 80)) } })} />
      <small>{t('Séparez les mots par une virgule.')}</small>
    </label>)}</div>}
    {p.layout && p.permissions.includes('layout') && <>
      <Choice floating separateLabel label={t('Colonnes')} value={String(p.layout.columns ?? settings.contentColumns)} options={['3', '4', '5'].map(v => [v, v])} onChange={v => onUpdate({ ...p, layout: { ...p.layout, columns: Number(v) as 3 | 4 | 5 } })} />
      <Toggle label={t('Afficher le nom et la date sous les affiches')} checked={p.layout.labels !== false} onChange={labels => onUpdate({ ...p, layout: { ...p.layout, labels } })} />
      <Choice floating separateLabel label={t('Densité')} value={p.layout.density ?? 'comfortable'} options={[[ 'compact', t('Compacte') ], [ 'comfortable', t('Confortable') ]]} onChange={v => onUpdate({ ...p, layout: { ...p.layout, density: v as 'compact' | 'comfortable' } })} />
    </>}
    {p.accessibility && p.permissions.includes('accessibility') && <>
      <Toggle label={t('Réduire les animations')} checked={p.accessibility.reduceMotion ?? false} onChange={reduceMotion => onUpdate({ ...p, accessibility: { ...p.accessibility, reduceMotion } })} />
      <Choice floating separateLabel label={t('Taille du texte')} value={String(p.accessibility.fontScale ?? 1)} options={['1', '1.1', '1.15', '1.2', '1.3'].map(v => [v, `${Math.round(Number(v) * 100)}%`])} onChange={v => onUpdate({ ...p, accessibility: { ...p.accessibility, fontScale: Number(v) } })} />
    </>}
    {p.spoilers && p.permissions.includes('spoilers') && <Toggle label={t('Masquer les épisodes non vus')} checked={p.spoilers.hideUnwatched} onChange={hideUnwatched => onUpdate({ ...p, spoilers: { hideUnwatched } })} />}
    {p.addons?.map(a => <button className="row" key={a.manifest} onClick={() => onAddon(a.manifest)}>{a.name}<FolderPlus /></button>)}
    {p.pages?.map(page => <button className="row" key={page.id} onClick={() => onOpenPage(page.id)}>{page.title}</button>)}
  </>
}
