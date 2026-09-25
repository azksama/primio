import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
const require = createRequire(new URL('../apps/client/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const browser = await chromium.launch({ headless: true })
const output = new URL('../tmp/validation-v0211/', import.meta.url).pathname.replace(
  /^\/([A-Z]:)/,
  '$1',
)
await mkdir(output, { recursive: true })
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
})
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const now = Date.now()
const metas = Array.from({ length: 18 }, (_, i) => ({
  id: 'qa' + i,
  type: ['movie', 'series', 'anime'][i % 3],
  name: 'QA ' + ['Movie', 'Series', 'Anime'][i % 3] + ' ' + i,
  poster: '/avatars/' + String((i % 10) + 1).padStart(2, '0') + '.jpg',
  background: '/avatars/01.jpg',
  genres: ['Adventure'],
  imdbRating: '8.2',
  cast: ['QA Actor One', 'QA Actor Two'],
  director: ['QA Director'],
  description:
    i === 1
      ? 'Repeated provider synopsis with a sufficiently long unique paragraph.\n\n'.repeat(15)
      : Array.from({ length: 30 }, (_, n) => 'A long synopsis part ' + n + '. ').join(''),
  trailers: [{ source: 'abcdefghijk' }],
  videos:
    i % 3
      ? [
          {
            id: 'qa' + i + ':1:1',
            title: 'New episode',
            thumbnail:
              i === 1 ? '/missing-episode-image.jpg' : i === 2 ? undefined : '/avatars/07.jpg',
            season: 1,
            episode: 1,
            released: new Date(now - 1000).toISOString(),
          },
          {
            id: 'qa' + i + ':1:2',
            title: 'Next episode',
            overview: 'A future episode synopsis that is shown in its own dialog in portrait.',
            season: 1,
            episode: 2,
            released: new Date(now + 86400000).toISOString(),
          },
        ]
      : undefined,
}))
await page.addInitScript(
  ({ metas, now }) => {
    const settings = {
      uiLanguage: 'en',
      reduceMotion: true,
      contentColumns: 3,
      showPosterLabels: true,
      episodeNotifications: true,
      updateNotifications: true,
    }
    const progress = metas.slice(0, 12).map((m, i) => ({
      ...m,
      videoId: i % 3 ? m.id + ':1:1' : m.id,
      position: 30,
      duration: 600,
      updatedAt: now - i,
      watched: false,
    }))
    const library = metas.slice(0, 9)
    progress.push({
      ...metas[12],
      videoId: metas[12].id,
      position: 600,
      duration: 600,
      updatedAt: now,
      watched: true,
    })
    library.push(metas[12])
    const profile = {
      id: 'main',
      avatar: '01',
      name: 'QA',
      color: '#DAD4C5',
      settings,
      library,
      progress,
    }
    const state = {
      settings,
      library,
      progress,
      profiles: [profile, { ...profile, id: 'second', name: 'QA Two', avatar: '02' }],
      activeProfileId: 'main',
      addons: [
        { url: 'https://qa.example/manifest.json', enabled: true },
        { url: 'https://qb.example/manifest.json', enabled: true },
      ],
    }
    const store = {
      state: JSON.stringify(state),
      onboarding: 'done',
      startupProfile: JSON.stringify({ account: 'local', profileId: 'main' }),
      notifications: JSON.stringify({ 'local:main': { since: now - 2000, read: [] } }),
    }
    const manifest = {
      id: 'qa.catalog',
      name: 'QA Catalog',
      version: '1.0.0',
      types: ['movie', 'series', 'anime'],
      resources: ['catalog', 'meta', 'stream'],
      catalogs: ['movie', 'series', 'anime'].map((type) => ({
        type,
        id: type,
        name: type,
        extra: [{ name: 'search' }, { name: 'genre', options: ['Adventure'] }],
      })),
    }
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
    window.isTauri = true
    window.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command, args = {}) => {
        if (command === 'secure_read') return store[args.key] ?? null
        if (command === 'secure_write') {
          store[args.key] = args.value
          return
        }
        if (command === 'fetch_json') {
          const url = new URL(args.url)
          if (url.hostname === 'kitsu.io')
            return {
              data: [
                {
                  id: '43806',
                  attributes: {
                    canonicalTitle: 'Chainsaw Man',
                    subtype: 'TV',
                    startDate: '2022-10-11',
                    posterImage: { large: '/avatars/03.jpg' },
                  },
                },
              ],
              links: {},
            }
          if (command === 'open_link') return null
          if (url.pathname.endsWith('manifest.json'))
            return { ...manifest, name: url.host === 'qa.example' ? 'QA Catalog' : 'QB Catalog' }
          if (url.pathname.includes('/catalog/')) {
            const type = url.pathname.split('/catalog/')[1].split('/')[0]
            return { metas: metas.filter((m) => m.type === type) }
          }
          if (url.pathname.includes('/meta/'))
            return { meta: metas.find((m) => url.pathname.endsWith('/' + m.id + '.json')) }
          return {
            streams: [
              { name: '1080p WEB-DL', title: '1.5 GB', url: 'https://media.example/one.mp4' },
              { name: '720p WEBRip', title: '850 MB', url: 'https://media.example/two.mp4' },
              { name: '4K BluRay', title: '8 GB', url: 'https://media.example/three.mp4' },
            ],
          }
        }
        if (command === 'api_request')
          return {
            version: '0.2.4',
            url: 'https://github.com/azksama/primio/releases/tag/v0.2.4-preview.1',
          }
        if (command === 'cast_discover') return []; if (command === 'tv_device') return false; if (command === 'crash_report') return ''; if (command === 'download_list') return { items: [] }
        if (command === 'notification_permission') return { enabled: true }
        if (command === 'notification_config') return
        if (command === 'plugin:deep-link|get_current') return null
        if (command === 'plugin:event|listen') return 1
        return null
      },
    }
  },
  { metas, now },
)

await page.goto(process.argv[2] ?? 'http://127.0.0.1:1420')
const nav=page.getByRole('navigation')
await nav.getByRole('button',{name:'My list',exact:true}).click()
await page.getByRole('button',{name:'Create collection',exact:true}).click()
await page.getByRole('dialog').getByRole('textbox').fill('Weekend')
await page.getByRole('dialog').getByRole('checkbox').first().check()
await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click()
await expect(page.getByRole('button',{name:/Weekend/})).toHaveAttribute('aria-pressed','true')
await page.screenshot({path:output+'/collection.png'})
await page.getByRole('button',{name:'Edit collection',exact:true}).click()
await expect(page.getByRole('dialog').getByRole('checkbox').first()).toBeChecked()
await page.getByRole('dialog').getByRole('button',{name:'Delete collection',exact:true}).click()
await expect(page.getByRole('button',{name:/Weekend/})).toHaveCount(0)
await nav.getByRole('button',{name:'Settings',exact:true}).click()
await page.getByRole('button',{name:/Connected services/}).click()
await expect(page.getByText('Sign in to sync your services.')).toBeVisible()
await nav.getByRole('button',{name:'Settings',exact:true}).click()
await page.getByRole('button',{name:/Diagnostic/}).click()
await expect(page.getByRole('button',{name:'Send report',exact:true})).toBeDisabled()
await page.screenshot({path:output+'/diagnostics.png'})
expect(errors).toEqual([])
console.log('Collections create/edit/delete, profile services, and voluntary diagnostic UI passed with mock bridge.')
await browser.close()
