import type { Meta, Progress, Settings } from './types'
import { collectionKey } from './collections'
import { isWatched } from './progress'
import { t } from './i18n'

export type ViewingStatus = 'planned' | 'watching' | 'completed'
export const statusLabel = (status: ViewingStatus) =>
  t({ planned: 'À voir', watching: 'En cours', completed: 'Terminé' }[status])
export function progressSignature(history: Progress[]) {
  let hash = 2166136261
  for (const c of JSON.stringify(
    history
      .map((p) => [p.videoId, Math.floor(p.position), p.watched ?? false])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(16)
}
export function viewingStatus(
  meta: Meta,
  progress: Progress[],
  settings: Settings,
  enriched: Meta[] = [],
): ViewingStatus {
  const history = progress.filter((p) => p.id === meta.id && p.type === meta.type)
  const manual = settings.titleStates?.find((s) => s.id === collectionKey(meta))
  if (
    manual &&
    (manual.progressSignature !== undefined
      ? manual.progressSignature === progressSignature(history)
      : !history.some((p) => p.updatedAt > manual.updatedAt && p.position > 0))
  )
    return manual.status
  if (meta.type === 'movie')
    return history.some(isWatched)
      ? 'completed'
      : history.some((p) => p.position > 0)
        ? 'watching'
        : 'planned'
  const full = enriched.find((m) => m.id === meta.id && m.type === meta.type) ?? meta
  const episodes = full.videos?.filter((v) => (v.season ?? 1) > 0) ?? []
  if (
    episodes.length &&
    episodes.every(
      (v) =>
        !v.releaseUnconfirmed &&
        (!v.released || Date.parse(v.released) <= Date.now()) &&
        history.some((p) => p.videoId === v.id && isWatched(p)),
    )
  )
    return 'completed'
  return history.some((p) => p.position > 0 || isWatched(p)) ? 'watching' : 'planned'
}
export function StatusChoice({
  meta,
  progress,
  settings,
  metas,
  onChange,
}: {
  meta: Meta
  progress: Progress[]
  settings: Settings
  metas: Meta[]
  onChange: (status: ViewingStatus) => void
}) {
  return (
    <label className="status-choice">
      {t('État de visionnage')}
      <select
        value={viewingStatus(meta, progress, settings, metas)}
        onChange={(e) => onChange(e.target.value as ViewingStatus)}
      >
        {(['planned', 'watching', 'completed'] as const).map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </select>
    </label>
  )
}
