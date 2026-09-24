import { useState } from 'react'
import { X } from 'lucide-react'
import { Choice } from './components'
import { t, locale } from './i18n'
import { durationLabel, isAnime } from './preferences'
import type { Progress } from './types'
export function periodKey(timestamp: number, mode: string) {
  const d = new Date(timestamp),
    year = String(d.getFullYear()),
    month = String(d.getMonth() + 1).padStart(2, '0'),
    day = String(d.getDate()).padStart(2, '0')
  return mode === 'year' ? year : mode === 'month' ? `${year}-${month}` : `${year}-${month}-${day}`
}
export function historyStats(items: Progress[]) {
  return {
    films: items.filter((p) => !isAnime(p) && p.type === 'movie').length,
    series: items.filter((p) => !isAnime(p) && p.type !== 'movie').length,
    anime: items.filter(isAnime).length,
    seconds: items.reduce(
      (sum, p) => sum + Math.min(Math.max(0, p.position), Math.max(0, p.duration)),
      0,
    ),
  }
}
export function ViewingHistory({
  items,
  onPlay,
  onRemove,
}: {
  items: Progress[]
  onPlay: (p: Progress) => void
  onRemove: (p: Progress) => void
}) {
  const [mode, setMode] = useState('day'),
    [period, setPeriod] = useState('all')
  const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt)
  const periods = [
    ...new Map(
      sorted.map((p) => {
        const key = periodKey(p.updatedAt, mode)
        return [
          key,
          new Date(p.updatedAt).toLocaleDateString(locale(), {
            year: 'numeric',
            ...(mode !== 'year' ? { month: 'long' as const } : {}),
            ...(mode === 'day' ? { day: 'numeric' as const } : {}),
          }),
        ]
      }),
    ).entries(),
  ]
  const visible = sorted.filter((p) => period === 'all' || periodKey(p.updatedAt, mode) === period),
    stats = historyStats(visible)
  return (
    <section className="viewing-history">
      <div className="history-filters">
        <Choice
          separateLabel
          label={t('Regrouper par')}
          value={mode}
          options={[
            ['day', t('Jour')],
            ['month', t('Mois')],
            ['year', t('Année')],
          ]}
          onChange={(v) => {
            setMode(v)
            setPeriod('all')
          }}
        />
        <Choice
          separateLabel
          label={t('Période')}
          value={period}
          options={[['all', t('Tout l’historique')], ...periods]}
          onChange={setPeriod}
        />
      </div>
      <div className="history-stats">
        {[
          [t('Films'), stats.films],
          [t('Épisodes de séries'), stats.series],
          [t('Animes'), stats.anime],
          [t('Temps regardé estimé'), durationLabel(stats.seconds)],
        ].map(([label, value]) => (
          <div className="glass" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {[...new Set(visible.map((p) => periodKey(p.updatedAt, mode)))].map((key) => (
        <section key={key}>
          <h2>{periods.find((p) => p[0] === key)?.[1]}</h2>
          {visible
            .filter((p) => periodKey(p.updatedAt, mode) === key)
            .map((p) => (
              <div className="row" key={p.type + ':' + p.videoId}>
                <button className="grow align-left" onClick={() => onPlay(p)}>
                  <strong>{p.name}</strong>
                  <small>
                    {p.videoId !== p.id ? p.videoId.split(':').slice(-2).join(' · ') + ' · ' : ''}
                    {durationLabel(p.position)}
                  </small>
                </button>
                <button
                  className="icon"
                  aria-label={t('Effacer ') + p.name + t(' de l’historique')}
                  onClick={() => onRemove(p)}
                >
                  <X />
                </button>
              </div>
            ))}
        </section>
      ))}
      {!visible.length && <p className="muted">{t('Aucun visionnage')}</p>}
    </section>
  )
}
