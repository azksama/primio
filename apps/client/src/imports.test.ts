import { describe, expect, it } from 'vitest'
import { mergeImport, parseImportJson, parseTraktCsv } from './imports'
import { createState } from './preferences'
describe('Library imports', () => {
  it('imports Stremio records and addons without deleted entries or duplicate records', () => {
    const preview = parseImportJson({
      addons: [{ transportUrl: 'https://example.org/manifest.json' }],
      library: [
        { _id: 'tt1', type: 'movie', name: 'Film' },
        { _id: 'tt1', type: 'movie', name: 'Film' },
        { _id: 'tt2', type: 'series', name: 'Removed', removed: true },
      ],
    })
    expect(preview.library.map((m) => m.id)).toEqual(['tt1'])
    expect(preview.addons).toEqual([{ url: 'https://example.org/manifest.json', enabled: true }])
  })
  it('maps AniList movies and series through their MAL identifiers', () => {
    const preview = parseImportJson({
      data: {
        MediaListCollection: {
          lists: [
            {
              entries: [
                {
                  media: {
                    idMal: 1,
                    format: 'TV',
                    title: { romaji: 'Cowboy Bebop' },
                    coverImage: { large: 'https://example.org/1.jpg' },
                  },
                },
                { media: { idMal: 2, format: 'MOVIE', title: { english: 'Movie' } } },
              ],
            },
          ],
        },
      },
    })
    expect(preview.library.map((m) => [m.id, m.type, m.category])).toEqual([
      ['mal:1', 'series', 'anime'],
      ['mal:2', 'movie', 'anime'],
    ])
  })
  it('parses quoted Trakt CSV and imports JSON watchlists', () => {
    const csv = 'type,title,imdb_id\r\nshow,"Title, with comma",tt1\r\nmovie,"A ""quote""",tt2\r\n'
    expect(parseTraktCsv(csv).library.map((m) => [m.type, m.name])).toEqual([
      ['series', 'Title, with comma'],
      ['movie', 'A "quote"'],
    ])
    expect(
      parseImportJson({ watchlist: [{ show: { title: 'Series', ids: { imdb: 'tt3' } } }] })
        .library[0].id,
    ).toBe('tt3')
    expect(() => parseTraktCsv('type,title\nmovie,"unclosed')).toThrow()
  })
  it('merges without deleting existing titles or changing installed addon preferences', () => {
    const state = createState()
    state.library = [{ id: 'tt0', type: 'movie', name: 'Existing' }]
    state.addons = [{ url: 'https://example.org/manifest.json', enabled: false }]
    const preview = parseImportJson({
      library: [{ _id: 'tt1', type: 'movie', name: 'New' }],
      addons: [{ transportUrl: 'https://example.org/manifest.json' }],
    })
    const next = mergeImport(state, preview)
    expect(next.library).toHaveLength(2)
    expect(next.addons[0].enabled).toBe(false)
    expect(state.library).toHaveLength(1)
  })
})
