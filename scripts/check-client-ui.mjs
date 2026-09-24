import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
const require = createRequire(new URL('../apps/client/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const browser = await chromium.launch({ headless: true })
const output = new URL('../tmp/validation-v028/', import.meta.url).pathname.replace(
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
            thumbnail: '/avatars/07.jpg',
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
        if (command === 'download_list') return { items: [] }
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
const nav = page.getByRole('navigation')
await expect(nav).toBeVisible()
await expect(page.locator('.continue-card')).toHaveCount(10)
await expect(page.locator('.continue-card').nth(1).locator('img')).toHaveAttribute(
  'src',
  '/avatars/07.jpg',
)
await expect(page.locator('.continue-card').nth(1)).toContainText('Episode 1')
await expect(page.locator('.continue-card').nth(1)).not.toContainText('Season 1')
const hero = await page.locator('.hero').boundingBox()
expect(hero.height).toBe(378)
await page.screenshot({ path: output + '/home-mobile.png' })
const heroTitle = await page.locator('.hero h1').textContent()
await page.locator('.hero h1').evaluate((el) => {
  el.textContent = 'The End of Oak Street and an especially long title'
})
for (const [width, height] of [
  [320, 640],
  [390, 844],
  [800, 1280],
  [1280, 800],
]) {
  await page.setViewportSize({ width, height })
  await page.locator('.continue-card strong').nth(2).evaluate(el => { el.textContent = 'A long title spanning at least two lines on phones' })
  const barTops = await page.locator('.continue-card progress').evaluateAll(nodes => nodes.map(el => el.getBoundingClientRect().top))
  expect(Math.max(...barTops) - Math.min(...barTops)).toBeLessThan(1)
  const head = await page.locator('.hero-head').boundingBox()
  const copy = await page.locator('.hero-copy').boundingBox()
  expect(copy.y).toBeGreaterThanOrEqual(head.y + head.height)
  expect(copy.x + copy.width).toBeLessThanOrEqual(width)
  await page.screenshot({ path: output + '/home-long-title-' + width + '.png' })
}
await page.locator('.hero h1').evaluate((el, title) => {
  el.textContent = title
}, heroTitle)
await page.setViewportSize({ width: 390, height: 844 })
const row = await page.locator('.continue-grid').evaluate((el) => ({
  tops: [...el.children].map((c) => c.getBoundingClientRect().top),
  width: el.clientWidth,
  scroll: el.scrollWidth,
}))
expect(new Set(row.tops).size).toBe(1)
expect(row.scroll).toBeGreaterThan(row.width)
await page.locator('.continue-grid').scrollIntoViewIfNeeded()
const rail = await page.locator('.continue-grid').boundingBox()
const beforeScroll = await page.evaluate(() => window.scrollY)
const cdp = await page.context().newCDPSession(page)
const startY = rail.y + Math.min(rail.height / 2, 100)
await cdp.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: 100, y: startY }],
})
for (let i = 1; i <= 10; i++) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: 100, y: startY - i * 15 }],
  })
  await page.waitForTimeout(16)
}
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeScroll + 50)

await nav.getByRole('button', { name: 'My list', exact: true }).click()
await expect(page.locator('.poster')).toHaveCount(10)
await page.getByRole('switch', { name: 'Hide watched titles' }).click()
await expect(page.locator('.poster')).toHaveCount(9)
await page.getByRole('button', { name: 'Releases', exact: true }).click()
await expect(page.locator('.release-item')).toHaveCount(6)
await expect(page.locator('.calendar-grid .selected .release-count')).toHaveText('6')
await expect(nav.getByRole('button', { name: 'My list', exact: true })).toHaveAttribute(
  'aria-current',
  'page',
)
await page.screenshot({ path: output + '/browser-calendar-fixture.png' })
await nav.getByRole('button', { name: 'Explore', exact: true }).click()
await page.getByRole('textbox').fill('QA')
await expect(page.locator('.search-section')).toHaveCount(3)
await expect(page.locator('.search-section').nth(0).locator('.poster')).toHaveCount(6)
await expect(page.locator('.search-section').nth(1).locator('.poster')).toHaveCount(6)
await expect(page.locator('.search-section').nth(2).locator('.poster')).toHaveCount(6)
await nav.getByRole('button', { name: 'Settings', exact: true }).click()
await page.getByRole('button', { name: 'Options Appearance and navigation' }).click()
await page.getByRole('button', { name: 'Content columns', exact: true }).click()
await page.getByRole('button', { name: '5', exact: true }).click()
await page.getByRole('switch', { name: 'Show titles and dates' }).click()
await nav.getByRole('button', { name: 'My list', exact: true }).click()
expect(
  await page
    .locator('.poster-grid')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
).toBe(5)
await expect(page.locator('.poster > strong').first()).toBeHidden()
await expect(page.getByRole('button', { name: 'QA Movie 0', exact: true })).toBeVisible()
await page.getByRole('button', { name: 'QA Movie 0', exact: true }).click()
expect(Array.from(await page.locator('.description .synopsis').innerText()).length).toBe(301)
await page.getByRole('button', { name: 'Show more', exact: true }).click()
expect(Array.from(await page.locator('.description .synopsis').innerText()).length).toBeGreaterThan(
  301,
)
for (const width of [320, 390, 600]) {
  await page.setViewportSize({ width, height: 844 })
  await expect(nav).toBeVisible()
  const box = await nav.boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(844)
}
await page.setViewportSize({ width: 390, height: 844 })
await expect(page.locator('.imdb-rating')).toContainText('IMDb · ★ 8.2/10')
await expect(page.locator('.content-credits')).toContainText('QA Director')
await expect(page.locator('.content-credits')).toContainText('QA Actor One')
await page.screenshot({ path: output + '/browser-content-fixture.png' })
await page.getByRole('button', { name: 'Continue watching', exact: true }).click()
await expect(page.locator('.compact-source')).toHaveCount(6)
await expect(page.locator('.source-addons button')).toHaveCount(3)
await page.getByRole('button', { name: 'Quality', exact: true }).click()
await page.getByRole('button', { name: '1080p', exact: true }).click()
await expect(page.locator('.compact-source')).toHaveCount(2)
await page.locator('.source-addons button').nth(1).click()
await expect(page.locator('.compact-source')).toHaveCount(1)
await page.getByRole('button', { name: 'Quality', exact: true }).click()
await page.locator('.choice-options button').first().click()
await page.getByRole('button', { name: 'Size', exact: true }).click()
await page.getByRole('button', { name: '< 1 GB', exact: true }).click()
await expect(page.locator('.compact-source')).toHaveCount(1)
await expect(page.locator('.source-download')).toHaveText('')
await page.screenshot({ path: output + '/browser-sources-fixture.png' })
await page.getByRole('button', { name: 'Close', exact: true }).click()
await page.getByRole('button', { name: 'Continue watching', exact: true }).click()
await expect(page.locator('.compact-source')).toHaveCount(1)
await expect(page.locator('.source-addons button').nth(1)).toHaveAttribute('aria-pressed', 'true')
await expect(page.getByRole('button', { name: 'Size', exact: true })).toContainText('< 1 GB')
await page.getByRole('button', { name: 'Close', exact: true }).click()
await page.locator('.detail-genres button').first().click()
await expect(page.getByRole('button', { name: 'Genre', exact: true })).toContainText('Adventure')
await nav.getByRole('button', { name: 'Settings', exact: true }).click()
await page.getByRole('button', { name: /Account and profiles/ }).click()
await expect(page.locator('.profiles .profile-actions')).toHaveCount(2)
const actions = await page
  .locator('.profiles .profile-actions')
  .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top))
expect(Math.abs(actions[0] - actions[1])).toBeLessThan(1)
await page.screenshot({ path: output + '/browser-profiles-fixture.png' })
await nav.getByRole('button', { name: 'My list', exact: true }).click()
await page.getByRole('button', { name: 'QA Series 1', exact: true }).click()
await expect(page.locator('.description .synopsis')).toHaveCount(1)
await expect(page.locator('.description .synopsis')).toHaveText(
  'Repeated provider synopsis with a sufficiently long unique paragraph.',
)
await expect(page.getByRole('button', { name: 'Trailer', exact: true })).toBeVisible()
await expect(page.locator('.episode-card').nth(1)).toBeEnabled()
await expect(page.locator('.episode-synopsis')).toBeHidden()
await page.getByRole('button', { name: 'Synopsis · Next episode', exact: true }).click()
await expect(page.getByRole('dialog')).toContainText('A future episode synopsis')
await page.screenshot({ path: output + '/episode-synopsis-portrait.png' })
await page.getByRole('button', { name: 'Close', exact: true }).click()
await page.locator('.episode-card').nth(1).click()
await expect(page.locator('.compact-source')).toHaveCount(1)
await page.getByRole('button', { name: 'Close', exact: true }).click()
await page.setViewportSize({ width: 900, height: 500 })
await expect(page.locator('.episode-synopsis')).toBeVisible()
await expect(page.locator('.episode-info')).toBeHidden()
await expect(page.locator('.detail-copy > .description')).toHaveCount(1)
await expect(page.locator('.detail-copy > .description')).toHaveText(
  'Repeated provider synopsis with a sufficiently long unique paragraph.',
)
await page.locator('.episodes').scrollIntoViewIfNeeded()
await page.screenshot({ path: output + '/episodes-landscape.png' })
await page.setViewportSize({ width: 390, height: 844 })
await nav.getByRole('button', { name: 'Settings', exact: true }).click()
await page.getByRole('button', { name: /Downloads Offline/ }).click()
await page.getByRole('button', { name: 'Delete unwatched downloads:', exact: true }).click()
await page.getByRole('button', { name: 'After 1 day', exact: true }).click()
await expect(
  page.getByRole('button', { name: 'Delete unwatched downloads:', exact: true }),
).toContainText('After 1 day')
await page.screenshot({ path: output + '/downloads-settings.png' })
await nav.getByRole('button', { name: 'Settings', exact: true }).click()
await page.getByRole('button', { name: /History/ }).click()
await expect(page.locator('.history-stats > div')).toHaveCount(4)
await page.getByRole('button', { name: 'Group by', exact: true }).click()
await page.getByRole('button', { name: 'Month', exact: true }).click()
await page.getByRole('button', { name: 'Period', exact: true }).click()
await page.locator('.choice-options button').last().click()
await expect(page.locator('.viewing-history .row .grow')).toHaveCount(13)
await page.screenshot({ path: output + '/history.png' })
await nav.getByRole('button', { name: 'Explore', exact: true }).click()
await page.getByRole('textbox').fill('')
await page.getByRole('button', { name: 'Type', exact: true }).click()
await page.getByRole('button', { name: 'Anime', exact: true }).click()
await page.getByRole('button', { name: 'Catalog', exact: true }).click()
await page.getByRole('button', { name: 'By season', exact: true }).click()
await page.getByRole('button', { name: 'Genre', exact: true }).click()
await page.getByRole('button', { name: 'Autumn 2022', exact: true }).click()
await expect(page.getByRole('button', { name: 'Chainsaw Man', exact: true })).toBeVisible()
await page.screenshot({ path: output + '/seasonal-anime.png' })
await page.getByRole('button', { name: 'Sort by', exact: true }).click()
await page.getByRole('button', { name: 'Name', exact: true }).click()
await page.locator('.explorer-sort > button').click()
await expect(page.locator('.explorer-sort > button')).toContainText('Ascending')
await nav.getByRole('button', { name: 'Settings', exact: true }).click()
await page.getByRole('button', { name: /^Addons/ }).click()
await expect(page.locator('.addon-actions')).toHaveCount(2)
for (const width of [320, 390, 900]) {
  await page.setViewportSize({ width, height: 844 })
  for (const action of await page.locator('.addon-actions button').all()) {
    const box = await action.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
  }
}
await page.screenshot({ path: output + '/addons.png' })
await nav.getByRole('button', { name: 'Settings', exact: true }).click()
await page.getByRole('button', { name: /^Plugins/ }).click()
await page.getByRole('button', { name: /Configure.*skip/i }).click()
await expect(page.getByRole('dialog').getByRole('switch', { name: /AniSkip/ })).toBeVisible()
await page.screenshot({ path: output + '/skip-settings.png' })
expect(errors).toEqual([])
console.log(
  'Client UI: continue row, watched filter, release calendar, grouped search, columns, hidden labels, long descriptions, touch scrolling, source filters, credits, profile alignment and navigation passed (mock providers/native bridge).',
)
await browser.close()
