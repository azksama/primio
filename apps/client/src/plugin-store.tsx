import { useState } from 'react'
import { definePlugin, type PrimioPlugin } from '@primio/sdk'
import { Check, Download, Search, Trash2 } from './icons'
import { t } from './i18n'

const plugin = (id: string, name: string, description: string, features: Partial<PrimioPlugin>) =>
  definePlugin({
    schemaVersion: 2,
    id: 'primio.' + id,
    name,
    description,
    author: 'Primio',
    version: '1.0.0',
    permissions: [],
    ...features,
  })
const theme = (
  id: string,
  name: string,
  description: string,
  background: string,
  surface: string,
  accent: string,
  text: string,
  muted: string,
  radius = 16,
) =>
  plugin(id, name, description, {
    category: 'theme',
    permissions: ['theme'],
    theme: { background, surface, accent, text, muted, radius },
  })
export const storePlugins: PrimioPlugin[] = [
  theme(
    'graphite',
    'Graphite',
    'Le verre fumé et les reflets ivoire de Primio.',
    '#101110',
    '#1D1E1C',
    '#DAD4C5',
    '#F3F1EB',
    '#B7B8B1',
  ),
  theme(
    'midnight',
    'Midnight',
    'Bleu nuit profond et accents argentés.',
    '#0B1220',
    '#172236',
    '#B7D6FF',
    '#EEF4FF',
    '#AABBD2',
  ),
  theme(
    'sakura',
    'Sakura',
    'Prune sombre et touches de rose poudré.',
    '#19121A',
    '#2B202D',
    '#F2BCD8',
    '#FFF0F8',
    '#CAB5C6',
    20,
  ),
  theme(
    'forest',
    'Forest',
    'Vert forêt, sauge et surfaces douces.',
    '#0E1713',
    '#1D2B23',
    '#B7D8AB',
    '#EFF6EC',
    '#AEBDAD',
  ),
  theme(
    'amber',
    'Amber',
    'Brun profond et accents ambrés.',
    '#19130E',
    '#2B2119',
    '#F1CA8C',
    '#FFF4E5',
    '#C7B6A0',
  ),
  theme(
    'oled',
    'OLED',
    'Noir pur et contraste renforcé.',
    '#000000',
    '#121212',
    '#FFFFFF',
    '#FFFFFF',
    '#C4C4C4',
    12,
  ),
  plugin(
    'anime-sources',
    'Anime VOSTFR',
    'Privilégier les sources VOSTFR et MULTI, masquer CAM et TS.',
    {
      category: 'sources',
      permissions: ['sources'],
      sources: { prefer: ['VOSTFR', 'MULTI', 'JAP'], hide: ['CAM', 'TELESYNC'] },
    },
  ),
  plugin('french-sources', 'Cinéma VF', 'Privilégier VFF, TRUEFRENCH puis MULTI.', {
    category: 'sources',
    permissions: ['sources'],
    sources: { prefer: ['VFF', 'TRUEFRENCH', 'MULTI'], hide: ['CAM', 'TELESYNC'] },
  }),
  plugin(
    'quality-sources',
    'Haute définition',
    'Classer les sources 2160p puis 1080p en premier.',
    {
      category: 'sources',
      permissions: ['sources'],
      sources: { prefer: ['2160p', '4K', '1080p'], hide: ['CAM', 'TELESYNC'] },
    },
  ),
  plugin('compact', 'Bibliothèque compacte', 'Cinq colonnes et affiches compactes.', {
    category: 'library',
    permissions: ['layout'],
    layout: { columns: 5, density: 'compact' },
  }),
  plugin('posters', 'Galerie d’affiches', 'Quatre colonnes, sans nom ni date sous les affiches.', {
    category: 'library',
    permissions: ['layout'],
    layout: { columns: 4, labels: false },
  }),
  plugin(
    'comfortable',
    'Lecture confortable',
    'Trois colonnes, texte agrandi et animations réduites.',
    {
      category: 'accessibility',
      permissions: ['layout', 'accessibility'],
      layout: { columns: 3, density: 'comfortable' },
      accessibility: { fontScale: 1.15, reduceMotion: true },
    },
  ),
  plugin('calm', 'Sans animations', 'Réduire les mouvements dans l’interface.', {
    category: 'accessibility',
    permissions: ['accessibility'],
    accessibility: { reduceMotion: true },
  }),
  plugin(
    'anti-spoilers',
    'Anti-spoilers',
    'Masquer les titres, images et résumés des épisodes non vus. Dévoilement à la demande.',
    { category: 'library', permissions: ['spoilers'], spoilers: { hideUnwatched: true } },
  ),
  plugin(
    'middle-earth',
    'La Terre du Milieu',
    'Deux parcours : ordre de sortie ou chronologie de l’histoire.',
    {
      category: 'library',
      permissions: ['watchOrder'],
      watchOrder: [
        {
          id: 'release',
          title: 'La Terre du Milieu · Sortie',
          order: 'release',
          entries: [
            { id: 'tt0120737', type: 'movie', name: 'The Fellowship of the Ring' },
            { id: 'tt0167261', type: 'movie', name: 'The Two Towers' },
            { id: 'tt0167260', type: 'movie', name: 'The Return of the King' },
            { id: 'tt0903624', type: 'movie', name: 'An Unexpected Journey' },
            { id: 'tt1170358', type: 'movie', name: 'The Desolation of Smaug' },
            { id: 'tt2310332', type: 'movie', name: 'The Battle of the Five Armies' },
          ],
        },
        {
          id: 'chronology',
          title: 'La Terre du Milieu · Chronologie',
          order: 'chronological',
          entries: [
            { id: 'tt0903624', type: 'movie', name: 'An Unexpected Journey' },
            { id: 'tt1170358', type: 'movie', name: 'The Desolation of Smaug' },
            { id: 'tt2310332', type: 'movie', name: 'The Battle of the Five Armies' },
            { id: 'tt0120737', type: 'movie', name: 'The Fellowship of the Ring' },
            { id: 'tt0167261', type: 'movie', name: 'The Two Towers' },
            { id: 'tt0167260', type: 'movie', name: 'The Return of the King' },
          ],
        },
      ],
    },
  ),
  plugin('star-wars', 'Star Wars', 'Les neuf films de la saga Skywalker dans l’ordre de sortie.', {
    category: 'library',
    permissions: ['watchOrder'],
    watchOrder: [
      {
        id: 'release',
        title: 'Star Wars · Sortie',
        order: 'release',
        entries: [
          ['tt0076759', 'A New Hope'],
          ['tt0080684', 'The Empire Strikes Back'],
          ['tt0086190', 'Return of the Jedi'],
          ['tt0120915', 'The Phantom Menace'],
          ['tt0121765', 'Attack of the Clones'],
          ['tt0121766', 'Revenge of the Sith'],
          ['tt2488496', 'The Force Awakens'],
          ['tt2527336', 'The Last Jedi'],
          ['tt2527338', 'The Rise of Skywalker'],
        ].map(([id, name]) => ({ id, name, type: 'movie' as const })),
      },
    ],
  }),
]

export function installPlugin(list: PrimioPlugin[], candidate: PrimioPlugin) {
  return [
    ...list
      .filter((p) => p.id !== candidate.id)
      .map((p) => (candidate.theme && p.theme ? { ...p, enabled: false } : p)),
    { ...candidate, enabled: true },
  ]
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
  const list = [
    ...storePlugins,
    ...installed.filter((p) => !storePlugins.some((s) => s.id === p.id)),
  ].filter(
    (p) =>
      (category === 'all' ||
        (category === 'installed' && installed.some((i) => i.id === p.id)) ||
        p.category === category) &&
      (t(p.name) + ' ' + t(p.description)).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )
  return (
    <section className="plugin-store" aria-label={t('Magasin de plugins')}>
      <h2>{t('Magasin de plugins')}</h2>
      <p className="muted">
        {t('Des extensions Primio prêtes à installer. Vous gardez le contrôle des permissions.')}
      </p>
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
          return (
            <article key={p.id} className="store-entry">
              {p.theme && (
                <div
                  className="theme-swatch"
                  aria-hidden="true"
                  style={{
                    background: p.theme.background,
                    color: p.theme.text,
                    borderColor: p.theme.accent,
                  }}
                >
                  <span style={{ background: p.theme.surface }} />
                  <span style={{ background: p.theme.accent }} />
                  <span style={{ background: p.theme.muted }} />
                </div>
              )}
              <div className="store-copy">
                <h3>{t(p.name)}</h3>
                <p>{t(p.description)}</p>
                <small>
                  {p.author} · {p.version}
                </small>
              </div>
              <div className="store-actions">
                {existing ? (
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
                    {t('Installer')}
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
