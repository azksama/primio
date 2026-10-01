import { useState } from 'react'
import { type PrimioPlugin } from '@primio/sdk'
import { useMarketplace } from './marketplace'
import { Check, Download, Search, Trash2, Play, Settings, Puzzle, Sparkles, Clapperboard, Bookmark, Eye } from './icons'
import { configurablePlugin } from './plugin-configuration'
import { t } from './i18n'
import { comparePluginVersions } from './marketplace'

export { officialPlugins as storePlugins } from '@primio/sdk/catalog'
import { officialPlugins as storePlugins } from '@primio/sdk/catalog'

export function upgradeStorePlugin(p: PrimioPlugin) {
  return p.id === 'primio.star-wars' && p.author === 'Primio' && p.version === '1.0.0'
    ? { ...storePlugins.find(s => s.id === p.id)!, enabled: p.enabled }
    : p
}

export function InstalledPlugins({ installed, onConfigure, onToggle, onRemove, onStore }: {
  installed: PrimioPlugin[]; onConfigure: (p: PrimioPlugin | null) => void;
  onToggle: (p: PrimioPlugin) => void; onRemove: (p: PrimioPlugin) => void; onStore: () => void;
}) {
  const configurationButton = (p: PrimioPlugin | null) => <button className="secondary plugin-configure" aria-haspopup="dialog" onClick={() => onConfigure(p)}>
    <Settings size={17} />{t('Configurer')}
  </button>
  return <section className="installed-plugins" aria-label={t('Plugins installés')}>
    <article className="installed-plugin">
      <div className="installed-plugin-heading"><span className="plugin-art" aria-hidden="true"><Sparkles /></span><div className="store-copy"><h2>Primio Intro Skipper</h2><p>{t('Passer les intros et les génériques.')}</p><small>{t('Plugin intégré')} · 0.2.1</small></div><span className="plugin-enabled"><Check size={16} />{t('Activé')}</span></div>
      <div className="store-actions">{configurationButton(null)}</div>
    </article>
    {installed.map(p => <article className="installed-plugin" key={p.id}>
      <div className="installed-plugin-heading"><PluginIcon plugin={p} /><div className="store-copy"><h2>{t(p.name)}</h2><p>{t(p.description)}</p><small>{p.author} · {p.version}</small></div></div>
      <div className="store-actions">
        <button className="secondary" aria-pressed={p.enabled !== false} onClick={() => onToggle(p)}>{p.enabled !== false && <Check size={16} />}{t(p.enabled !== false ? 'Activé' : 'Activer')}</button>
        {configurablePlugin(p) && configurationButton(p)}
        <button className="icon plugin-uninstall" aria-label={t('Désinstaller ') + t(p.name)} onClick={() => onRemove(p)}><Trash2 size={18} /></button>
      </div>
    </article>)}
    {!installed.length && <div className="plugins-empty"><p>{t('Aucun plugin supplémentaire installé.')}</p><button className="secondary" onClick={onStore}>{t('Découvrir les plugins')}</button></div>}
  </section>
}

export function installPlugin(list: PrimioPlugin[], candidate: PrimioPlugin) {
  return [
    ...list
      .filter((p) => p.id !== candidate.id)
      .map((p) => (candidate.theme && p.theme ? { ...p, enabled: false } : p)),
    { ...candidate, enabled: true },
  ]
}
function PluginIcon({ plugin }: { plugin: PrimioPlugin }) {
  const [failed, setFailed] = useState<string>()
  if (plugin.icon && failed !== plugin.icon) return <span className="plugin-art" aria-hidden="true"><img src={plugin.icon} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(plugin.icon)} /></span>
  if (plugin.theme) return <span className="plugin-art plugin-theme-art" aria-hidden="true" style={{ background: plugin.theme.background, borderColor: plugin.theme.accent }}>
    <span style={{ background: plugin.theme.surface }}><Play size={20} style={{ color: plugin.theme.accent }} /></span>
  </span>
  const Icon = plugin.watchOrder ? Clapperboard : plugin.sources ? Play : plugin.layout ? Bookmark : plugin.accessibility || plugin.spoilers ? Eye : Puzzle
  return <span className="plugin-art" aria-hidden="true"><Icon /></span>
}
export function enableInstalledPlugin(list: PrimioPlugin[], candidate: PrimioPlugin) {
  return list.map(p => p.id === candidate.id ? { ...p, enabled:true } : candidate.theme && p.theme ? { ...p, enabled:false } : p)
}
export function PluginStore({
  installed,
  onInstall,
  onToggle,
  onRemove,
}: {
  installed: PrimioPlugin[]
  onInstall: (p: PrimioPlugin) => void
  onToggle: (p: PrimioPlugin) => void
  onRemove: (p: PrimioPlugin) => void
}) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('all')
  const marketplace = useMarketplace()
  const available = marketplace.entries.map(entry => {
    const current = installed.find(plugin => plugin.id === entry.manifest.id)
    // An offline bundled catalog must never offer to downgrade an installed plugin.
    return current && comparePluginVersions(current.version, entry.manifest.version) >= 0 ? current : entry.manifest
  })
  const list = [
    ...available,
    ...installed.filter((p) => !available.some((s) => s.id === p.id)),
  ].filter(
    (p) =>
      (category === 'all' ||
        (category === 'installed' && installed.some((i) => i.id === p.id)) ||
        p.category === category) &&
      (t(p.name) + ' ' + t(p.description)).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  return (
    <section className="plugin-store" aria-label={t('Magasin de plugins')}>
      <p className="muted">
        {t('Des extensions Primio prêtes à installer. Vous gardez le contrôle des permissions.')}
      </p>
      {marketplace.status === 'offline' && <div className="marketplace-status" role="status"><span>{t('Magasin temporairement indisponible. Le catalogue local reste accessible.')}</span><button className="secondary" onClick={marketplace.refresh}>{t('Réessayer')}</button></div>}
      {marketplace.status === 'loading' && <p className="muted" role="status">{t('Actualisation du magasin…')}</p>}
      <label className="search-box">
        <Search />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Rechercher un plugin')}
          aria-label={t('Rechercher un plugin')}
        />
      </label>
      <div className="plugin-filters" aria-label={t('Catégories')}>
        {[
          ['all', 'Tous'],
          ['theme', 'Thèmes'],
          ['library', 'Bibliothèque'],
          ['sources', 'Sources'],
          ['accessibility', 'Accessibilité'],
          ['installed', 'Installés'],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>
            {t(label)}
          </button>
        ))}
      </div>
      <div className="plugin-store-list">
        {list.map((p) => {
          const existing = installed.find((i) => i.id === p.id),
            enabled = existing?.enabled !== false
          const badges = marketplace.entries.find(entry => entry.manifest.id === p.id)
          return (
            <article key={p.id} className="store-entry">
              {p.theme ? (
                <div
                  className={'theme-swatch' + (p.theme.material === 'neumorphic' ? ' theme-swatch-neo' : '')}
                  aria-hidden="true"
                  style={{
                    background: p.theme.background,
                    color: p.theme.text,
                    borderColor: p.theme.accent,
                  }}
                >
                  {p.theme.material === 'neumorphic' ? <>
                    <span className="theme-swatch-play" style={{color:p.theme.accent, background:p.theme.surface, boxShadow:`4px 4px 8px ${p.theme.shadowDark}, -4px -4px 8px ${p.theme.shadowLight}`}}><Play /></span>
                    <span className="theme-swatch-track" style={{boxShadow:`inset 2px 2px 3px ${p.theme.shadowDark}, inset -2px -2px 3px ${p.theme.shadowLight}`}}><i style={{background:p.theme.accent}} /></span>
                  </> : <>
                    <span style={{ background: p.theme.surface }} />
                    <span style={{ background: p.theme.accent }} />
                    <span style={{ background: p.theme.muted }} />
                  </>}
                </div>
              ) : <PluginIcon plugin={p} />}
              <div className="store-copy">
                <h3>{t(p.name)}</h3>
                {badges && <div className="plugin-badges">{badges.official && <span>{t('Officiel')}</span>}{badges.verified && <span><Check size={12} />{t('Vérifié')}</span>}{badges.featured && <span>{t('Mis en avant')}</span>}</div>}
                <p>{t(p.description)}</p>
                <small>
                  {p.author} · {p.version}
                </small>
              </div>
              <div className="store-actions">
                {existing && existing.version === p.version ? (
                  <>
                    <button
                      className="secondary"
                      aria-pressed={enabled}
                      onClick={() => onToggle(existing)}
                    >
                      {enabled ? <Check size={16} /> : null}
                      {t(enabled ? 'Activé' : 'Activer')}
                    </button>
                    <button
                      className="icon"
                      aria-label={t('Désinstaller ') + t(p.name)}
                      onClick={() => onRemove(p)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </>
                ) : (
                  <button className="secondary" onClick={() => onInstall(p)}>
                    <Download size={16} />
                    {t(existing ? 'Mettre à jour' : 'Installer')}
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>
      {!list.length && <p role="status">{t('Aucun plugin ne correspond à votre recherche.')}</p>}
    </section>
  )
}
