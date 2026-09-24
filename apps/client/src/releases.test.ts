import { describe, expect, it } from 'vitest'
import { newerVersion, releaseEntries, titleWatched } from './releases'
import { recordProgress } from './progress'
import type { Meta } from './types'

const series: Meta = {
  id: 's1',
  type: 'series',
  name: 'Series',
  videos: [
    { id: 's1:1:1', title: 'One', season: 1, episode: 1, released: '2020-01-01' },
    { id: 's1:1:2', title: 'Two', season: 1, episode: 2, released: '2099-01-01' },
  ],
}
describe('Library releases', () => {
  it('deduplicates provider metadata and excludes unusable release dates', () => {
    const result = releaseEntries([
      series,
      {
        ...series,
        videos: [...series.videos!, { id: 'unknown', title: 'Unknown', released: 'invalid' }],
      },
    ])
    expect(result.map((e) => e.videoId)).toEqual(['s1:1:1', 's1:1:2'])
  })
  it('hides a series only when all its released episodes have been watched', () => {
    const progress = recordProgress([], series, 's1:1:1', 100, 100)
    expect(titleWatched(series, progress, [])).toBe(false)
    expect(titleWatched(series, progress, [series])).toBe(true)
    expect(
      titleWatched(series, progress, [
        {
          ...series,
          videos: [...series.videos!, { id: 's1:1:3', title: 'Three', released: '2020-01-02' }],
        },
      ]),
    ).toBe(false)
  })
  it('compares version components numerically and rejects malformed versions', () => {
    expect(newerVersion('0.2.10', '0.2.9')).toBe(true)
    for (const value of ['0.2.4', '0.1.9', 'x', '0.2.5-preview', '0.-1.2'])
      expect(newerVersion(value, '0.2.4')).toBe(false)
  })
})
