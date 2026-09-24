import type { Meta, Settings, Stream } from './types'
import { sourceInfo, sourceLanguages } from './sources'
export interface SourcePreference {
  contentId: string
  videoId: string
  provider: string
  bingeGroup?: string
  quality: string
  format: string
  audio: string[]
  subtitles: string[]
}
export function rememberSource(
  settings: Settings,
  meta: Meta,
  videoId: string,
  stream: Stream,
): Settings {
  const { quality, format } = sourceInfo(stream)
  const { audio, subtitles } = sourceLanguages(stream)
  const preference = {
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
      ...(settings.sourcePreferences ?? []).filter((p) => p.contentId !== preference.contentId),
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
