import { t } from './i18n'
import { ThumbsDown } from './icons'
import { useEffect, useState, type ReactNode } from 'react'
import { metadata } from './addons'
import { matchesCategory } from './preferences'
import { Deferred } from './progressive'
import { affinity, discoveryPool, enrichDiscovery } from './discovery'
import type { Addon, Meta, Progress, UserState } from './types'
type Props = {
  category: string
  addons: Addon[]
  library: UserState['library']
  progress: Progress[]
  dismissed: string[]
  onDismiss: (m: Meta) => void
  renderItem: (m: Meta) => ReactNode
  onExplore: () => void
}
export function Recommendations(props: Props) {
  return (
    <Deferred>
      <RecommendationShelf {...props} />
    </Deferred>
  )
}
function RecommendationShelf({
  category,
  addons,
  library,
  progress,
  dismissed,
  onDismiss,
  renderItem,
  onExplore,
}: Props) {
  const [items, setItems] = useState<Meta[]>([]),
    [seeds, setSeeds] = useState<Meta[]>([]),
    [busy, setBusy] = useState(true),
    [mood, setMood] = useState('similar'),
    [watched, setWatched] = useState(false)
  const historyKey = JSON.stringify(progress.map((p) => [p.id, p.type, p.position > 0, p.watched]))
  useEffect(() => {
    let active = true
    setBusy(true)
    void (async () => {
      const history = [
        ...new Map(
          progress
            .filter((p) => (p.position > 0 || p.watched) && matchesCategory(p, category))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((p) => [p.id, p]),
        ).values(),
      ].slice(0, 4)
      const selected = history.length
        ? history
        : library.filter((m) => matchesCategory(m, category)).slice(0, 4)
      const full = await Promise.all(selected.map((m) => metadata(addons, m).catch(() => m)))
      const candidates = await enrichDiscovery(
        addons,
        await discoveryPool(addons, '', [], category),
        24,
      )
      if (active) {
        setSeeds(full)
        setWatched(history.length > 0)
        setItems(
          candidates.filter(
            (m) =>
              matchesCategory(m, category) &&
              !selected.some((s) => s.id === m.id) &&
              !library.some((s) => s.id === m.id && s.type === m.type),
          ),
        )
      }
    })()
      .catch(() => {
        if (active) setItems([])
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [category, addons, library, historyKey])
  const ranked = items
    .filter((m) => !dismissed.includes(m.type + ':' + m.id))
    .map((m) => ({ meta: m, ...affinity(m, seeds, mood) }))
    .filter((m) => !['director', 'cast'].includes(mood) || m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
  return (
    <section className="shelf">
      <div className="section-head">
        <h2>
          {t(
            category === 'movie'
              ? 'Films pour vous'
              : category === 'anime'
                ? 'Animes pour vous'
                : 'Séries pour vous',
          )}
        </h2>
        <button onClick={onExplore}>{t('Tout voir')}</button>
      </div>
      {!!seeds.length && (
        <p className="recommendation-hint">
          {t(watched ? 'Parce que vous avez regardé' : 'Parce que vous avez ajouté')}
          {' : '}
          {seeds.map((m) => m.name).join(', ')}
        </p>
      )}
      <div className="recommendation-moods" role="group" aria-label={t('Votre envie')}>
        {[
          ['similar', 'Même ambiance'],
          ['darker', 'Plus sombre'],
          ['funnier', 'Plus drôle'],
          ['shorter', 'Plus court'],
          ['director', 'Même réalisateur'],
          ['cast', 'Acteurs en commun'],
        ].map(([v, l]) => (
          <button key={v} aria-pressed={v === mood} onClick={() => setMood(v)}>
            {t(l)}
          </button>
        ))}
      </div>
      {busy ? (
        <p role="status">{t('Recherche…')}</p>
      ) : ranked.length ? (
        <div className="poster-rail">
          {ranked.map(({ meta, reasons }) => (
            <div className="recommendation-item" key={meta.type + meta.id}>
              {renderItem(meta)}
              {reasons.length > 0 && <small>{reasons.map((r) => t(r)).join(' · ')}</small>}
              <div className="recommendation-poster-actions">
                <button className="recommendation-dismiss glass" aria-label={t('Je ne suis pas intéressé') + ' · ' + meta.name} title={t('Je ne suis pas intéressé')} onClick={() => onDismiss(meta)}>
                  <ThumbsDown size={19} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{t('Aucune suggestion disponible pour le moment.')}</p>
      )}
    </section>
  )
}
