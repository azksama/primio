import { useState } from 'react'
import type { PrimioPlugin, WatchOrder } from '@primio/sdk'
import { DialogShell } from './dialog-shell'
import { Preferences } from './components'
import { PluginConfiguration } from './plugin-configuration'
import { defaultWatchOrder } from './watch-collections'
import { Check, LoaderCircle, X } from './icons'
import { t } from './i18n'
import type { Settings } from './types'

export function PluginConfigurationDialog({ plugin, settings, onSave, onClose, onOpenPage, onAddon }: {
  plugin: PrimioPlugin | null; settings: Settings;
  onSave: (plugin: PrimioPlugin | null, settings: Partial<Settings>, order?: WatchOrder) => Promise<void>;
  onClose: () => void; onOpenPage: (id: string) => void; onAddon: (manifest: string) => void;
}) {
  const [initial] = useState(() => structuredClone(settings))
  const [draftSettings, setSettings] = useState(initial)
  const [draftPlugin, setPlugin] = useState(() => plugin ? structuredClone(plugin) : null)
  const [orderId, setOrderId] = useState(plugin ? defaultWatchOrder(plugin)?.id ?? '' : '')
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const close = () => { if (!saving) onClose() }
  const save = async () => {
    if (saving) return
    setSaving(true); setError('')
    try {
      const changes = Object.fromEntries(Object.entries(draftSettings).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(initial[key as keyof Settings]))) as Partial<Settings>
      await onSave(draftPlugin, changes, draftPlugin?.watchOrder?.find(order => order.id === orderId))
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : t('Impossible d’enregistrer. Réessayez.'))
    } finally { setSaving(false) }
  }
  const title = plugin ? t(plugin.name) : 'Primio Intro Skipper'
  return <DialogShell title={title} className="plugin-config-dialog" onClose={close}>
    <header className="dialog-head">
      <h2>{title}</h2>
      <button className="icon" aria-label={t('Fermer')} disabled={saving} onClick={close}><X /></button>
    </header>
    <div className="plugin-configuration">
      {draftPlugin ? <PluginConfiguration plugin={draftPlugin} settings={draftSettings} onSettings={setSettings} onUpdate={setPlugin}
        orderId={orderId} onOrder={setOrderId} onOpenPage={onOpenPage} onAddon={onAddon}
      /> : <Preferences section="skip" settings={draftSettings} onChange={setSettings} />}
      {error && <p className="dialog-error" role="alert">{error}</p>}
    </div>
    <footer className="plugin-config-actions">
      <button className="secondary" disabled={saving} onClick={close}>{t('Annuler')}</button>
      <button className="primary" disabled={saving} onClick={() => void save()}>{saving ? <LoaderCircle /> : <Check />}{t('Enregistrer')}</button>
    </footer>
  </DialogShell>
}
