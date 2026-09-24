import { LanguageFlag } from './language-flag'
import { languageName } from './i18n'
import { useState } from 'react'
import { Download, Play } from 'lucide-react'
import { Choice } from './components'
import { t } from './i18n'
import type { Stream, Settings } from './types'

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
const languagePatterns: [string, RegExp][] = [
  ['fra', /🇫🇷|\b(?:french|français|fra|fre|vff|vfq|truefrench|vf)\b/i],
  ['eng', /🇬🇧|🇺🇸|\b(?:english|anglais|eng)\b/i],
  ['jpn', /🇯🇵|\b(?:japanese|japonais|jpn|jap)\b/i],
  ['deu', /🇩🇪|\b(?:german|deutsch|ger|deu)\b/i],
  ['spa', /🇪🇸|\b(?:spanish|español|spa)\b/i],
  ['por', /🇵🇹|🇧🇷|\b(?:portuguese|português|por)\b/i],
  ['kor', /🇰🇷|\b(?:korean|kor)\b/i],
  ['zho', /🇨🇳|\b(?:chinese|mandarin|zho|chi)\b/i],
  ['ita', /🇮🇹|\b(?:italian|ita)\b/i],
]
export function sourceLanguages(stream: Stream) {
  const lines = [stream.name, stream.title, stream.description]
    .filter(Boolean)
    .join('\n')
    .split(/\n/)
  const subs = lines
    .filter((line) => /\b(?:subtitles?|subs?|sous.titres?)\b|💬/i.test(line))
    .join(' ')
  const audioText = lines
    .filter((line) => !/\b(?:subtitles?|subs?|sous.titres?)\b|💬/i.test(line))
    .join(' ')
  const aliases: Record<string, string> = {
    fr: 'fra',
    fre: 'fra',
    en: 'eng',
    ja: 'jpn',
    de: 'deu',
    ger: 'deu',
    es: 'spa',
    pt: 'por',
    ko: 'kor',
    zh: 'zho',
    it: 'ita',
  }
  const normalize = (codes: string[]) =>
    codes.map((c) => aliases[c.toLowerCase()] ?? c.toLowerCase())
  const audio = [
    ...new Set([
      ...normalize(stream.audioLanguages ?? []),
      ...languagePatterns.filter(([, re]) => re.test(audioText)).map(([code]) => code),
    ]),
  ]
  const subtitles = [
    ...new Set([
      ...normalize(stream.subtitleLanguages ?? []),
      ...normalize((stream.subtitles ?? []).map((s) => s.lang)),
      ...languagePatterns.filter(([, re]) => re.test(subs)).map(([code]) => code),
      ...(/\bvostfr\b/i.test(audioText) ? ['fra'] : []),
    ]),
  ]
  return { audio, subtitles }
}
function SourceLanguages({ stream }: { stream: Stream }) {
  const languages = sourceLanguages(stream)
  return (
    <span className="source-languages">
      {(['audio', 'subtitles'] as const).map((kind) => (
        <span key={kind}>
          <b>{t(kind === 'audio' ? 'Audio' : 'Sous-titres')}</b>
          {languages[kind].length ? (
            languages[kind].map((code) => (
              <span key={code} title={languageName(code, code)}>
                <LanguageFlag code={code} />
                {languageName(code, code)}
              </span>
            ))
          ) : (
            <span>{t('Non précisé')}</span>
          )}
        </span>
      ))}
    </span>
  )
}
export function Sources({
  items,
  busy,
  filters,
  onFiltersChange,
  onPlay,
  onDownload,
}: {
  items: Stream[]
  busy: boolean
  filters?: Settings['sourceFilters']
  onFiltersChange?: (filters: NonNullable<Settings['sourceFilters']>) => void
  onPlay: (s: Stream) => void
  onDownload: (s: Stream) => void
}) {
  const providers = [
    ...new Map(
      items.map((s) => [s.addonKey ?? s.addonName ?? 'unknown', s.addonName ?? t('Source')]),
    ).entries(),
  ]
  const [selection, setSelection] = useState(
    filters ?? { provider: 'all', quality: 'all', format: 'all', size: 'all' },
  )
  const { quality, format, size } = selection
  const provider =
    selection.provider === 'all' || providers.some(([id]) => id === selection.provider)
      ? selection.provider
      : 'all'
  const update = (change: Partial<typeof selection>) => {
    const next = { ...selection, ...change }
    setSelection(next)
    onFiltersChange?.(next)
  }
  const group = items
    .filter((s) => provider === 'all' || (s.addonKey ?? s.addonName ?? 'unknown') === provider)
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
        ? b.bytes === null
          ? 0
          : 1
        : b.bytes === null
          ? -1
          : (a.bytes - b.bytes) * (size === 'asc' ? 1 : -1),
    )
  return (
    <div className="sources">
      <div className="chips source-addons" aria-label={t('Addons')}>
        {[['all', t('Tous')], ...providers].map(([id, name]) => (
          <button
            key={id}
            aria-pressed={provider === id}
            className={provider === id ? 'selected' : ''}
            onClick={() => {
              update({ provider: id })
            }}
          >
            {name}
            <span className="source-count">
              {id === 'all'
                ? items.length
                : items.filter((s) => (s.addonKey ?? s.addonName ?? 'unknown') === id).length}
            </span>
          </button>
        ))}
      </div>
      <div className="source-filters">
        <Choice
          separateLabel
          label={t('Qualité')}
          value={quality}
          options={options([
            ...group.map((s) => s.quality),
            ...(quality === 'all' ? [] : [quality === 'unknown' ? '' : quality]),
          ])}
          onChange={(quality) => update({ quality })}
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
          onChange={(size) => update({ size })}
        />
        <Choice
          separateLabel
          label={t('Type')}
          value={format}
          options={options([
            ...group.map((s) => s.format),
            ...(format === 'all' ? [] : [format === 'unknown' ? '' : format]),
          ])}
          onChange={(format) => update({ format })}
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
                <SourceLanguages stream={s} />
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
        {!visible.length && (
          <div>
            <p className="muted">{t('Aucune source pour ces filtres.')}</p>
            <button
              className="secondary"
              onClick={() =>
                update({ provider: 'all', quality: 'all', format: 'all', size: 'all' })
              }
            >
              {t('Réinitialiser les filtres')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
