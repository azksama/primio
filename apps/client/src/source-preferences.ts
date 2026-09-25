import type { Meta, Settings, Stream } from './types'
import { sourceInfo, sourceLanguages } from './sources'
export interface SourcePreference {
  fingerprint?: string
  contentId: string
  videoId: string
  provider: string
  bingeGroup?: string
  quality: string
  format: string
  audio: string[]
  subtitles: string[]
}
export async function rememberSource(
  settings: Settings,
  meta: Meta,
  videoId: string,
  stream: Stream,
): Promise<Settings> {
  const { quality, format } = sourceInfo(stream)
  const { audio, subtitles } = sourceLanguages(stream)
  const preference = {
    fingerprint: await sourceFingerprint(stream),
    contentId: meta.type + ':' + meta.id,
    videoId,
    provider: stream.addonKey ?? stream.addonName ?? '',
    bingeGroup: stream.behaviorHints?.bingeGroup,
    quality,
    format,
    audio,
    subtitles,
  }
  return {
    ...settings,
    sourcePreferences: [
      preference,
      ...(settings.sourcePreferences ?? []).filter(
        (p) => p.contentId !== preference.contentId || p.videoId !== videoId,
      ),
    ].slice(0, 100),
  }
}
export function equivalentSources(items: Stream[], settings: Settings, meta: Meta) {
  const preference = settings.sourcePreferences?.find(
    (p) => p.contentId === meta.type + ':' + meta.id,
  )
  if (!preference) return { items, equivalent: undefined }
  const scored = items
    .map((stream, index) => {
      const info = sourceInfo(stream),
        languages = sourceLanguages(stream)
      const sameProvider = (stream.addonKey ?? stream.addonName ?? '') === preference.provider
      const binge =
        sameProvider &&
        !!preference.bingeGroup &&
        preference.bingeGroup === stream.behaviorHints?.bingeGroup
      const quality = !preference.quality || info.quality === preference.quality
      const format = !preference.format || info.format === preference.format
      const audio = preference.audio.every((lang) => languages.audio.includes(lang))
      const subtitles = preference.subtitles.every((lang) => languages.subtitles.includes(lang))
      return {
        stream,
        index,
        equivalent:
          !!stream.url && sameProvider && (binge || (quality && format && audio && subtitles)),
        score:
          (sameProvider ? 20 : 0) +
          (binge ? 100 : 0) +
          (quality ? 8 : 0) +
          (format ? 4 : 0) +
          (audio ? 8 : 0) +
          (subtitles ? 4 : 0),
      }
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
  return {
    items: scored.map((s) => s.stream),
    equivalent: scored.find((s) => s.equivalent)?.stream,
  }
}

export async function sourceFingerprint(stream: Stream) {
  // Provider URLs may expire; file metadata identifies the refreshed source.
  const file = stream.behaviorHints?.filename
  if (stream.infoHash) return JSON.stringify(['torrent', stream.infoHash, stream.fileIdx ?? 0])
  if (file) return JSON.stringify(['file', file, stream.name ?? ''])
  if (stream.title || stream.description)
    return JSON.stringify(['title', stream.name ?? '', stream.title ?? stream.description])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stream.url ?? ''))
  return 'url:' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
export async function previouslyUsedSource(
  items: Stream[],
  settings: Settings,
  meta: Meta,
  videoId: string,
) {
  const saved = settings.sourcePreferences?.find(
    (p) => p.contentId === meta.type + ':' + meta.id && p.videoId === videoId,
  )
  if (!saved?.fingerprint) return undefined
  const candidates = await Promise.all(
    items
      .filter((s) => !!s.url && (s.addonKey ?? s.addonName ?? '') === saved.provider)
      .map(async (stream) => ({ stream, fingerprint: await sourceFingerprint(stream) })),
  )
  const matches = candidates.filter((c) => c.fingerprint === saved.fingerprint).map((c) => c.stream)
  return matches.length === 1 ? matches[0] : undefined
}
