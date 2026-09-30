import { describe, it, expect } from 'vitest'
import { episodeQueue, watchVideoId } from './episodes'
const meta = {
  id: 'series',
  name: 'Series',
  type: 'series',
  videos: [
    { id: 's2e1', title: 'Next season', season: 2, episode: 1 },
    { id: 's1e2', title: 'Second', season: 1, episode: 2 },
    { id: 'special', title: 'Special', season: 0, episode: 1 },
    { id: 's1e1', title: 'First', season: 1, episode: 1 },
    { id: 'future', title: 'Future', season: 3, episode: 1, released: '2100-01-01' },
  ],
}
describe('episode queue', () => {
  it('transfers artwork and synopsis and conceals spoilers for unwatched episodes', () => {
    const rich = { ...meta, videos: [{ id: 's1e1', title: 'Long episode title', season: 1, episode: 1,
      thumbnail: 'https://example.org/episode.jpg', overview: 'Episode synopsis' }] }
    expect(episodeQueue(rich, 's1e1').episodes[0]).toMatchObject({ thumbnail: 'https://example.org/episode.jpg', description: 'Episode synopsis' })
    expect(episodeQueue(rich, 's1e1', Date.now(), true).episodes[0]).toMatchObject({ thumbnail: '', description: '' })
    expect(episodeQueue(rich, 's1e1', Date.now(), true).episodes[0].title).not.toBe('Long episode title')
  })
  it('does not select a future or unconfirmed first episode', () => {
    expect(watchVideoId({ ...meta, videos: [meta.videos[4]] }, [])).toBeUndefined()
    expect(watchVideoId({ ...meta, videos: [{ ...meta.videos[3], releaseUnconfirmed: true }] }, [])).toBeUndefined()
  })
  it('sorts episodes and crosses season boundaries', () => {
    expect(episodeQueue(meta, 's1e1').nextVideoId).toBe('s1e2')
    expect(episodeQueue(meta, 's1e2').nextVideoId).toBe('s2e1')
  })
  it('does not autoplay future episodes or invent a successor', () => {
    expect(episodeQueue(meta, 's2e1').nextVideoId).toBe('')
    expect(episodeQueue(meta, 'missing').nextVideoId).toBe('')
    expect(episodeQueue(meta, 's1e1').episodes.some((v) => v.id === 'future')).toBe(true)
  })
  it('supports single-season anime without season metadata', () => {
    const anime = {
      id: 'mal:1',
      name: 'Anime',
      type: 'anime',
      videos: [
        { id: 'a1', title: 'One', episode: 1 },
        { id: 'a2', title: 'Two', episode: 2 },
      ],
    }
    expect(episodeQueue(anime, 'a1').nextVideoId).toBe('a2')
    expect(new Set(episodeQueue(anime, 'a1').episodes.map((v) => v.season)).size).toBe(1)
  })
})
