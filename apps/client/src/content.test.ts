import { describe, it, expect } from 'vitest'
import { cleanDescription, trailerUrl, trailerEmbedUrl } from './content'
import { seasonUrl, seasonOptions } from './seasonal'
import { historyStats, periodKey } from './history'
describe('content presentation', () => {
  it('removes repeated paragraphs without losing unique paragraphs', () => {
    expect(cleanDescription('First paragraph.\n\nFirst paragraph.\n\nDifferent paragraph.')).toBe(
      'First paragraph.\n\nDifferent paragraph.',
    )
  })
  it('removes concatenated duplicate synopses', () => {
    const text = 'God-like tombs surface globally, granting mythical powers to their discoverers.'
    expect(cleanDescription((text + ' ').repeat(12))).toBe(text)
  })
  it('preserves a long synopsis with distinct paragraphs', () => {
    const text = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} has a distinct story.`).join(
      '\n\n',
    )
    expect(cleanDescription(text)).toBe(text)
  })
  it('supports both YouTube trailer conventions and rejects unsafe schemes', () => {
    const meta = { id: 'm', type: 'movie', name: 'Film' }
    expect(trailerUrl({ ...meta, trailers: [{ source: 'abcdefghijk' }] })).toContain(
      'watch?v=abcdefghijk',
    )
    expect(trailerUrl({ ...meta, trailerStreams: [{ ytId: 'abcdefghijk' }] })).toContain(
      'watch?v=abcdefghijk',
    )
    expect(trailerUrl({ ...meta, trailers: [{ url: 'javascript:alert(1)' }] })).toBe('')
  })
  it('requests exactly the selected season and pagination offset', () => {
    const url = new URL(seasonUrl('2022-fall', 'Chainsaw', 20))
    expect(url.searchParams.get('filter[seasonYear]')).toBe('2022')
    expect(url.searchParams.get('filter[season]')).toBe('fall')
    expect(url.searchParams.get('page[offset]')).toBe('20')
    expect(() => seasonUrl('invalid', '', 0)).toThrow()
    expect(seasonOptions(new Date(2026, 8, 23)).some(([id]) => id === '2022-fall')).toBe(true)
  })
  it('embeds supported trailers without accepting a lookalike provider domain', () => {
    expect(trailerEmbedUrl('https://youtu.be/abcdefghijk', 'https://tauri.localhost')).toContain(
      '/embed/abcdefghijk?',
    )
    expect(
      trailerEmbedUrl('https://www.youtube.com/watch?v=abcdefghijk', 'https://tauri.localhost'),
    ).toContain('widget_referrer=')
    expect(
      trailerEmbedUrl(
        'https://youtube.com.attacker.test/watch?v=abcdefghijk',
        'https://tauri.localhost',
      ),
    ).toBe('')
    expect(trailerEmbedUrl('javascript:alert(1)', 'https://tauri.localhost')).toBe('')
  })
  it('groups local dates without moving a late-night viewing to another day', () => {
    const stamp = new Date(2026, 8, 23, 23, 59).getTime()
    expect(periodKey(stamp, 'day')).toBe('2026-09-23')
    expect(periodKey(stamp, 'month')).toBe('2026-09')
  })
  it('counts exclusive content categories and bounds estimated watch time', () => {
    const base = { name: 'Title', position: 120, duration: 100, updatedAt: 1, videoId: '1' }
    expect(
      historyStats([
        { ...base, id: 'm', type: 'movie' },
        { ...base, id: 's', type: 'series' },
        { ...base, id: 'kitsu:1', type: 'series' },
      ]),
    ).toEqual({ films: 1, series: 1, anime: 1, seconds: 300 })
  })
})
