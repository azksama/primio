import { describe, expect, it } from 'vitest'
import { continueWatching } from './continue-watching'
import { recordProgress } from './progress'
import type { Meta } from './types'

const series: Meta = { id: 'show', type: 'series', name: 'Show', videos: [
  { id: 'e1', title: 'One', season: 1, episode: 1 },
  { id: 'e2', title: 'Two', season: 1, episode: 2, thumbnail: 'https://example.org/two.jpg' },
  { id: 'e3', title: 'Three', season: 2, episode: 1, released: '2026-10-01T00:00:00Z' },
  { id: 'e4', title: 'Unconfirmed', season: 2, episode: 2, releaseUnconfirmed: true },
] }

describe('Continue Watching episode handoff', () => {
  it('keeps a single current episode per series and carries the complete player queue', () => {
    let progress = recordProgress([], series, 'e1', 10, 100, 1)
    progress = recordProgress(progress, series, 'e2', 20, 100, 2)
    const items = continueWatching(progress, [series])
    expect(items.map(p => p.videoId)).toEqual(['e2'])
    expect(items[0].meta?.videos).toHaveLength(4)
  })
  it('proposes the aired next episode at zero without modifying stored history', () => {
    const progress = recordProgress([], series, 'e1', 100, 100, 1)
    const before = structuredClone(progress)
    expect(continueWatching(progress, [series])[0]).toMatchObject({
      videoId: 'e2', position: 0, duration: 0, watched: false, nextEpisode: true,
      episodeThumbnail: 'https://example.org/two.jpg', episode: 2,
    })
    expect(progress).toEqual(before)
  })
  it('waits for the release date and crosses the season boundary when it arrives', () => {
    const progress = recordProgress([], series, 'e2', 100, 100, 1)
    expect(continueWatching(progress, [series], Date.parse('2026-09-30T23:59:59Z'))).toEqual([])
    expect(continueWatching(progress, [series], Date.parse('2026-10-01T00:00:00Z'))[0]).toMatchObject({ videoId: 'e3', season: 2, episode: 1 })
  })
  it('keeps the newly started episode instead of offering its predecessor', () => {
    let progress = recordProgress([], series, 'e1', 100, 100, 1)
    progress = recordProgress(progress, series, 'e2', 12, 100, 2)
    expect(continueWatching(progress, [series])[0]).toMatchObject({ videoId: 'e2', position: 12 })
    expect(continueWatching(progress, [series])[0].nextEpisode).toBeUndefined()
  })
  it('supports missing historical episode metadata and skips watched successors', () => {
    let progress = recordProgress([], series, 'e1', 100, 100, 1)
    progress = recordProgress(progress, series, 'e2', 100, 100, 2)
    const partial = { ...series, videos: series.videos!.slice(2) }
    expect(continueWatching(progress, [partial], Date.parse('2026-10-02'))[0].videoId).toBe('e3')
  })
  it('does not fabricate successors for completed films or unavailable providers', () => {
    const movie = { id: 'film', type: 'movie', name: 'Film' }
    expect(continueWatching(recordProgress([], movie, movie.id, 100, 100, 1), [movie])).toEqual([])
    expect(continueWatching(recordProgress([], series, 'e1', 100, 100, 1), [])).toEqual([])
    expect(continueWatching(recordProgress([], series, 'e1', 10, 100, 1), [])[0].videoId).toBe('e1')
  })
  it('does not offer an unconfirmed release after the last aired episode', () => {
    const progress = recordProgress([], series, 'e3', 100, 100, 1)
    expect(continueWatching(progress, [series], Date.parse('2030-01-01'))).toEqual([])
  })
})
