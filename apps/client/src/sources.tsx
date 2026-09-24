import { useState } from 'react'
import { Download, Play } from 'lucide-react'
import { Choice } from './components'
import { t } from './i18n'
import type { Stream } from './types'

export function sourceInfo(stream: Stream) {
  const text = [stream.name, stream.title, stream.description, stream.behaviorHints?.filename]
    .filter(Boolean)
    .join(' ')
  const resolution = text.match(/\b(2160|1440|1080|720|480|360)p?\b/i)?.[1]
  const quality = resolution ? resolution + 'p' : /\b4k\b/i.test(text) ? '2160p' : ''
  const match = text
    .match(
      /\b(web[ ._-]?dl|web[ ._-]?rip|blu[ ._-]?ray|b[dr]rip|remux|hdtv|dvdrip|cam|telesync)\b/i,
    )?.[1]
    ?.toLowerCase()
    .replace(/[ ._-]/g, '')
  const format = match
    ? (
        {
          webdl: 'WEB-DL',
          webrip: 'WEBRip',
          bluray: 'Blu-ray',
          brrip: 'BRRip',
          bdrip: 'BDRip',
          remux: 'REMUX',
          hdtv: 'HDTV',
          dvdrip: 'DVDRip',
          cam: 'CAM',
          telesync: 'TS',
        } as Record<string, string>
      )[match]
    : ''
  const size = text.match(/\b(\d+(?:[.,]\d+)?)\s*(GiB|MiB|TiB|GB|MB|TB|Go|Mo|To)\b/i)
  const hinted = stream.behaviorHints?.videoSize
  const bytes =
    typeof hinted === 'number' && Number.isFinite(hinted) && hinted > 0
      ? hinted
      : size
        ? Number(size[1].replace(',', '.')) *
          (/i/i.test(size[2]) ? 1024 : 1000) **
            ({ m: 2, g: 3, t: 4 }[size[2][0].toLowerCase()] ?? 0)
        : null
  return { quality, format, bytes }
}
export function Sources({
  items,
  busy,
  onPlay,
  onDownload,
}: {
  items: Stream[]
  busy: boolean
  onPlay: (s: Stream) => void
  onDownload: (s: Stream) => void
}) {
  const providers = [
    ...new Map(
      items.map((s) => [s.addonKey ?? s.addonName ?? '', s.addonName ?? t('Source')]),
    ).entries(),
  ]
  const [provider, setProvider] = useState(providers[0]?.[0] ?? '')
  const [quality, setQuality] = useState('all'),
    [format, setFormat] = useState('all'),
    [size, setSize] = useState('all')
  const group = items
    .filter((s) => (s.addonKey ?? s.addonName ?? '') === provider)
    .map((s) => ({ stream: s, ...sourceInfo(s) }))
  const options = (values: string[]) =>
    [
      ['all', t('Tous')],
      ...[...new Set(values)].sort().map((v) => [v || 'unknown', v || t('Non précisé')]),
    ] as [string, string][]
  const visible = group.filter(
    (s) =>
      (quality === 'all' || (s.quality || 'unknown') === quality) &&
      (format === 'all' || (s.format || 'unknown') === format) &&
      (size === 'unknown'
        ? s.bytes === null
        : size === 'small'
          ? s.bytes !== null && s.bytes < 1e9
          : size === 'medium'
            ? s.bytes !== null && s.bytes >= 1e9 && s.bytes < 5e9
            : size === 'large'
              ? s.bytes !== null && s.bytes >= 5e9
              : true),
  )
  if (size === 'asc' || size === 'desc')
    visible.sort((a, b) =>
      a.bytes === null
        ? 1
        : b.bytes === null
          ? -1
          : (a.bytes - b.bytes) * (size === 'asc' ? 1 : -1),
    )
  return (
    <div className="sources">
      <div className="chips source-addons" aria-label={t('Addons')}>
        {providers.map(([id, name]) => (
          <button
            key={id}
            aria-pressed={provider === id}
            className={provider === id ? 'selected' : ''}
            onClick={() => {
              setProvider(id)
              setQuality('all')
              setFormat('all')
              setSize('all')
            }}
          >
            {name}
            <span className="source-count">
              {items.filter((s) => (s.addonKey ?? s.addonName ?? '') === id).length}
            </span>
          </button>
        ))}
      </div>
      <div className="source-filters">
        <Choice
          separateLabel
          label={t('Qualité')}
          value={quality}
          options={options(group.map((s) => s.quality))}
          onChange={setQuality}
        />
        <Choice
          separateLabel
          label={t('Taille')}
          value={size}
          options={[
            ['all', t('Tous')],
            ['small', '< 1 GB'],
            ['medium', '1–5 GB'],
            ['large', '≥ 5 GB'],
            ['asc', t('Croissante')],
            ['desc', t('Décroissante')],
            ['unknown', t('Non précisé')],
          ]}
          onChange={setSize}
        />
        <Choice
          separateLabel
          label={t('Type')}
          value={format}
          options={options(group.map((s) => s.format))}
          onChange={setFormat}
        />
      </div>
      <div className="source-results" aria-live="polite">
        {visible.map(({ stream: s, quality, format, bytes }, i) => (
          <article key={i} className="compact-source glass">
            <button className="source-play" disabled={busy} onClick={() => onPlay(s)}>
              <span className="source-copy">
                <strong>{s.name || t('Source')}</strong>
                <span className="source-description">
                  {s.title || s.description || t('Lecture directe')}
                </span>
                <small>
                  {[
                    quality,
                    format,
                    bytes !== null
                      ? (bytes / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
                        ' GB'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </span>
              <Play aria-hidden="true" />
            </button>
            {s.url && (
              <button
                disabled={busy}
                className="icon source-download"
                aria-label={t('Télécharger') + ' · ' + (s.name || t('Source'))}
                onClick={() => onDownload(s)}
              >
                <Download />
              </button>
            )}
          </article>
        ))}
        {!visible.length && <p className="muted">{t('Aucune source pour ces filtres.')}</p>}
      </div>
    </div>
  )
}
