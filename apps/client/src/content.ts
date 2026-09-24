import type { Meta } from './types'

export function cleanDescription(value: string) {
  const text = value.trim()
  const paragraphs = [
    ...new Set(
      text
        .split(/\n\s*\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].join('\n\n')
  // Some providers concatenate the same synopsis without paragraph separators.
  for (let length = 40; length <= paragraphs.length / 2; length++) {
    if (paragraphs[length] !== paragraphs[0]) continue
    const unit = paragraphs.slice(0, length).trim()
    if (unit && paragraphs.split(unit).every((part) => !part.trim())) return unit
  }
  return paragraphs
}

export function trailerUrl(meta: Meta) {
  for (const trailer of [...(meta.trailers ?? []), ...(meta.trailerStreams ?? [])]) {
    const id = trailer.ytId ?? trailer.source
    if (id && /^[\w-]{11}$/.test(id)) return 'https://www.youtube.com/watch?v=' + id
    const url = trailer.url ?? trailer.externalUrl
    if (url?.startsWith('https://')) return url
  }
  return ''
}
