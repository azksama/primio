import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
const require = createRequire(new URL('../apps/client/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const desktop = process.env.PRIMIO_UI_DESKTOP === '1'
const browser = await chromium.launch({ headless: true })
const output = new URL(
  desktop ? '../tmp/validation-discovery-desktop/' : '../tmp/validation-discovery/',
  import.meta.url,
).pathname.replace(/^\/([A-Z]:)/, '$1')
await mkdir(output, { recursive: true })
const page = await browser.newPage({
  viewport: desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 },
  hasTouch: !desktop,
  userAgent: desktop
    ? undefined
    : 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
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
  genres: ['Adventure', 'Science Fiction'],
  releaseInfo: '1995',
  runtime: '105 min',
  country: 'Japan',
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
    window.__catalogCalls = 0
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
    window.isTauri = true
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
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
            window.__catalogCalls++
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
        if (command === 'cast_discover') return []
        if (command === 'tv_device') return false
        if (command === 'crash_report') return ''
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

try {
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:1420')
  const nav = page.getByRole('navigation')
  await expect(nav).toBeVisible()
  await page.locator('.random-pick summary').click()
  await page
    .locator('.random-pick')
    .getByRole('button', { name: 'Surprise me', exact: true })
    .click()
  await expect(page.locator('.random-result')).toBeVisible()
  await page.locator('.random-pick').scrollIntoViewIfNeeded()
  await page.screenshot({ path: output + '/mobile-random.png' })
  await nav.getByRole('button', { name: 'Explore', exact: true }).click()
  const search = page.getByRole('textbox', { name: 'Search for a title', exact: true })
  await search.fill('QA')
  await expect(page.locator('.search-suggestions')).toBeVisible()
  await page.getByRole('button', { name: 'Close suggestions' }).click()
  await search.fill('films de SF japonais des années 90')
  await expect(page.locator('.search-section .poster')).toHaveCount(6)
  await page.locator('.advanced-discover summary').click()
  await page.getByRole('spinbutton', { name: 'Minimum rating' }).fill('9')
  await expect(page.locator('.search-section .poster')).toHaveCount(0)
  await page.getByRole('spinbutton', { name: 'Minimum rating' }).fill('8')
  await expect(page.locator('.search-section .poster')).toHaveCount(6)
  await page.screenshot({ path: output + '/mobile-discover.png' })
  const exploreMain = page.locator('main:visible')
  const firstResult = exploreMain.locator('.poster').first()
  const originalNode = await firstResult.evaluate((node) => {
    window.__keptPoster = node
    return true
  })
  await page.evaluate(() =>
    (document.documentElement.classList.contains('desktop')
      ? document.querySelector('.page-slide')
      : window
    ).scrollTo(0, 300),
  )
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.classList.contains('desktop')
          ? document.querySelector('.page-slide').scrollTop
          : scrollY,
      ),
    )
    .toBe(300)
  const callsBefore = await page.evaluate(() => window.__catalogCalls)
  await firstResult.evaluate((node) => node.click())
  await page.getByRole('button', { name: 'Back', exact: true }).first().click()
  await expect(page.locator('main:visible .search-section .poster')).toHaveCount(6)
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.classList.contains('desktop')
          ? document.querySelector('.page-slide').scrollTop
          : scrollY,
      ),
    )
    .toBe(300)
  if (
    !(await page
      .locator('main:visible .poster')
      .first()
      .evaluate((node) => node === window.__keptPoster))
  )
    throw Error('Explorer poster DOM remounted on return')
  await nav.getByRole('button', { name: 'Home', exact: true }).click()
  await nav.getByRole('button', { name: 'Explore', exact: true }).click()
  await expect(search).toHaveValue('films de SF japonais des années 90')
  if ((await page.evaluate(() => window.__catalogCalls)) !== callsBefore)
    throw Error('Navigation refetched catalog results')

  await nav.getByRole('button', { name: 'Settings', exact: true }).click()
  await page
    .getByRole('button', { name: /Account and profiles/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Protect this profile with a PIN' }).click()
  await page.getByLabel('New PIN (4–8 digits)').fill('8520')
  await page.getByLabel('Confirm PIN').fill('8520')
  await page.locator('.pin-settings').getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Change profile PIN' })).toBeVisible()
  await expect
    .poll(
      async () =>
        JSON.parse(
          await page.evaluate(() =>
            window.__TAURI_INTERNALS__.invoke('secure_read', { key: 'state' }),
          ),
        ).profiles[0].pin?.hash,
    )
    .toBeTruthy()
  // Reload must lock even an automatically selected profile.
  await page.evaluate(async () => {
    const x = await window.__TAURI_INTERNALS__.invoke('secure_read', { key: 'state' })
    sessionStorage.setItem('qa-persisted', x)
  })
  await page.addInitScript(() => {
    const value = sessionStorage.getItem('qa-persisted')
    if (!value) return
    const original = window.__TAURI_INTERNALS__.invoke
    window.__TAURI_INTERNALS__.invoke = (cmd, args) =>
      cmd === 'secure_read' && args?.key === 'state' ? Promise.resolve(value) : original(cmd, args)
  })
  await page.reload()
  await expect(page.locator('.profile-picker')).toBeVisible()
  await expect(
    page.locator('.profile-picker').getByRole('button', { name: 'Close', exact: true }),
  ).toBeDisabled()
  await page.locator('.profile-picker .profile-card').first().click()
  await page.locator('.pin-dialog input').fill('1111')
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Incorrect PIN')
  await page.locator('.pin-dialog input').fill('8520')
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(page.locator('.profile-picker')).toHaveCount(0)
  await nav.getByRole('button', { name: 'Settings', exact: true }).click()
  await page
    .getByRole('button', { name: /Plugins/ })
    .first()
    .click()
  await page
    .locator('.store-entry')
    .filter({ hasText: 'Midnight' })
    .getByRole('button', { name: 'Install', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Authorize and install', exact: true })
    .click()
  await expect(
    page
      .locator('.store-entry')
      .filter({ hasText: 'Midnight' })
      .getByRole('button', { name: 'Enabled' }),
  ).toBeVisible()
  await page.screenshot({ path: output + '/mobile-plugin-store.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: output + '/desktop-plugin-store.png' })
  for (const size of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size)
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
      throw Error('Horizontal overflow')
  }
  if (errors.length) throw Error(errors.join('\n'))
  console.log(
    'Discovery, random, PIN restart/wrong code/unlock and plugin activation passed (browser with mocked providers/native bridge).',
  )
} finally {
  await browser.close()
}
