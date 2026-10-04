import { prepareDiscoveryFixtures } from './fixtures/discovery.mjs'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
const require = createRequire(new URL('../apps/client/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const browser = await chromium.launch({ headless: true })
const output = new URL('../tmp/validation-v029/', import.meta.url).pathname.replace(
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
try {
  await prepareDiscoveryFixtures(page, { variant: 'client' })
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:1420')
  await expect(
    page.locator('.continue-card').filter({ hasText: 'QA Series 1' }).locator('img'),
  ).toHaveAttribute('src', '/avatars/02.jpg')
  await expect(
    page.locator('.continue-card').filter({ hasText: 'QA Anime 2' }).locator('img'),
  ).toHaveAttribute('src', '/avatars/03.jpg')
  const nav = page.getByRole('navigation')
  await expect(nav).toBeVisible()
  await expect(page.locator('.continue-card')).toHaveCount(10)
  await expect(page.locator('.continue-card').nth(4).locator('img')).toHaveAttribute(
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
    await page
      .locator('.continue-card strong')
      .nth(2)
      .evaluate((el) => {
        el.textContent = 'A long title spanning at least two lines on phones'
      })
    const barTops = await page
      .locator('.continue-card progress')
      .evaluateAll((nodes) => nodes.map((el) => el.getBoundingClientRect().top))
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
  await expect(page.locator('main:visible .poster-grid .poster')).toHaveCount(10)
  await page.getByRole('switch', { name: 'Hide watched titles' }).click()
  await expect(page.locator('main:visible .poster-grid .poster')).toHaveCount(9)
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
      .locator('main:visible .poster-grid')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
  ).toBe(5)
  await expect(page.locator('main:visible .poster > strong').first()).toBeHidden()
  await expect(page.getByRole('button', { name: 'QA Movie 0', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'QA Movie 0', exact: true }).click()
  expect(Array.from(await page.locator('.description .synopsis').innerText()).length).toBe(301)
  await page.getByRole('button', { name: 'Show more', exact: true }).click()
  expect(
    Array.from(await page.locator('.description .synopsis').innerText()).length,
  ).toBeGreaterThan(301)
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
  await page.route('https://www.youtube-nocookie.com/embed/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<body style="background:#111;color:white">Trailer provider fixture</body>',
    }),
  )
  await page.getByRole('button', { name: 'Trailer', exact: true }).click()
  await expect(page.locator('.trailer-dialog iframe')).toHaveAttribute(
    'src',
    /youtube-nocookie.com\/embed\/abcdefghijk/,
  )
  await page.screenshot({ path: output + '/trailer-dialog-phone.png' })
  await page.locator('.trailer-dialog').getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.locator('.trailer-dialog iframe')).toHaveCount(0)
  await expect(page.locator('.episode-card').nth(1)).toBeEnabled()
  await expect(page.locator('.episode-synopsis')).toBeVisible()
  await expect(page.locator('.episode-synopsis')).toHaveCSS('-webkit-line-clamp', '1')
  await page.getByRole('button', { name: 'Synopsis · Next episode', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('A future episode synopsis')
  await page.screenshot({ path: output + '/episode-synopsis-portrait.png' })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.episode-card').nth(1).click()
  await expect(page.locator('.compact-source')).toHaveCount(1)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.setViewportSize({ width: 900, height: 500 })
  await expect(page.locator('.episode-synopsis')).toBeVisible()
  await expect(page.locator('.episode-synopsis')).toHaveCSS('-webkit-line-clamp', '2')
  await expect(page.locator('.episode-info')).toBeVisible()
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
  await page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Primio Intro Skipper', exact: true }) })
    .getByRole('button', { name: 'Configure', exact: true })
    .click()
  await expect(page.getByRole('dialog').getByRole('switch', { name: /AniSkip/ })).toBeVisible()
  await page.screenshot({ path: output + '/skip-settings.png' })
  expect(errors).toEqual([])
  console.log(
    'Client UI: continue row, watched filter, release calendar, grouped search, columns, hidden labels, long descriptions, touch scrolling, source filters, credits, profile alignment and navigation passed (mock providers/native bridge).',
  )
} catch (error) {
  await page.screenshot({ path: output + '/failure.png', fullPage: true })
  console.error(await page.locator('main:visible').ariaSnapshot())
  throw error
} finally {
  await browser.close()
}
