import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { prepareDiscoveryFixtures } from './fixtures/discovery.mjs'
const require = createRequire(new URL('../apps/client/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const output = fileURLToPath(new URL('../.impeccable/review/home-episodes/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
async function setup(page, language = 'en') {
  await prepareDiscoveryFixtures(page)
  await page.addInitScript(language => {
    const original = window.__TAURI_INTERNALS__.invoke
    window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      const value = await original(command, args)
      if (command === 'secure_read' && args.key === 'state') {
        const state = JSON.parse(value)
        state.settings.uiLanguage = language
        state.settings.interfaceFont = 'manrope'
        state.profiles.forEach(profile => { profile.settings = state.settings })
        return JSON.stringify(state)
      }
      return value
    }
  }, language)
  await page.route('**/qa-logo.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="170"><text x="250" y="115" fill="white">QA</text></svg>' }))
}
async function swipe(page, x1, x2, y) {
  const session = await page.context().newCDPSession(page)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y }] })
  for (let i = 1; i <= 6; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / 6, y }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await session.detach()
}
try {
  for (const width of [390, 1024, 1440].filter(width => !process.env.PRIMIO_QA_WIDTH || width === Number(process.env.PRIMIO_QA_WIDTH))) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true,
      userAgent: width < 1100 ? 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36' : undefined })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await setup(page)
    await page.clock.install()
    await page.goto(process.env.PRIMIO_UI_URL ?? 'http://127.0.0.1:9477')
    const hero = page.locator('.hero'), dots = hero.locator('.hero-pagination button[aria-pressed]')
    await expect(dots).toHaveCount(3)
    await expect.poll(() => hero.locator('h1').evaluate(node => getComputedStyle(node).fontFamily)).toContain('Manrope')
    const initial = await hero.getAttribute('data-category')
    await page.clock.fastForward(15_100)
    await expect(hero).not.toHaveAttribute('data-category', initial)
    const pause = hero.locator('.featured-pause'), second = await hero.getAttribute('data-category')
    await pause.click(); await page.clock.fastForward(20_000)
    await expect(hero).toHaveAttribute('data-category', second)
    expect(await hero.locator('.clock-time').evaluate(n => getComputedStyle(n).animationName)).toBe('none')
    await pause.click(); await page.clock.fastForward(15_100)
    await expect(hero).not.toHaveAttribute('data-category', second)
    await pause.click()
    const box = await hero.boundingBox(), selected = await hero.getAttribute('data-category')
    await swipe(page, box.x + box.width * .8, box.x + box.width * .2, box.y + 110)
    await expect(hero).not.toHaveAttribute('data-category', selected)
    await expect(hero).toBeVisible() // Swiping the carousel does not navigate away from Home.
    await swipe(page, box.x + box.width * .2, box.x + box.width * .8, box.y + 110)
    await expect(hero).toHaveAttribute('data-category', selected)
    const shelf = page.locator('.shelf').filter({ has: page.getByRole('heading', { name: 'Continue watching', exact: true }) })
    await expect(shelf.locator('.continue-card')).toHaveCount(10)
    await shelf.getByRole('button', { name: 'See all', exact: true }).click()
    await expect(page.locator('.continue-all .continue-card')).toHaveCount(12)
    await page.screenshot({ path: `${output}/${width}-continue-all.png` })
    await page.getByRole('navigation').getByRole('button', { name: 'Explore', exact: true }).click()
    await page.getByRole('button', { name: /^Type/ }).click()
    await page.locator('.choice-options').getByRole('button', { name: 'Anime', exact: true }).click()
    await page.getByRole('textbox', { name: 'Search for a title', exact: true }).fill('QA')
    await expect(page.locator('.search-section .poster')).toHaveCount(6)
    await expect(page.locator('.search-section')).toHaveCount(1)
    await expect(page.locator('.search-section h2')).toContainText('Anime')
    expect(await page.locator('.search-suggestions button small').allTextContents()).not.toContain('Film')
    await page.screenshot({ path: `${output}/${width}-anime-search.png` })
    await page.getByRole('navigation').getByRole('button', { name: 'My list', exact: true }).click()
    await page.locator('.poster').filter({ hasText: 'QA Series 1' }).click()
    await expect(page.locator('.episode-card .media-image img').first()).toBeVisible()
    await expect.poll(() => page.locator('.episode-card .media-image img').first().evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true)
    const bar = page.getByRole('progressbar', { name: 'Viewing progress' }).first()
    const initialProgress = await bar.getAttribute('aria-valuenow')
    const watched = page.locator('.episode-watched').first()
    await watched.click(); await expect(watched).toHaveAttribute('aria-pressed', 'true')
    await expect(bar).toHaveAttribute('aria-valuenow', '100')
    await watched.click(); await expect(watched).toHaveAttribute('aria-pressed', 'false')
    await expect(bar).toHaveAttribute('aria-valuenow', initialProgress)
    await expect(page.locator('.episode-list')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: `${output}/${width}-episodes.png` })
    expect(errors).toEqual([])
    results.push({ width, autoRotation: true, pauseResume: true, swipeBothDirections: true, font: 'Manrope', continueCount: 12, animeOnlySearch: true, episodePreviewAndProgress: true, watchedStateInPlace: true, errors })
    console.log('Verified viewport', width)
    await page.close()
  }
  const labels = { en: 'Surprise me', fr: 'Surprenez-moi', de: 'Überrasche mich', es: 'Sorpréndeme', pt: 'Surpreenda-me', ja: 'おまかせ', 'zh-Hans': '给我惊喜', 'zh-Hant': '給我驚喜' }
  for (const [language, label] of Object.entries(labels)) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await setup(page, language); await page.goto(process.env.PRIMIO_UI_URL ?? 'http://127.0.0.1:9477')
    await expect(page.locator('.random-draw')).toHaveText(label)
    await expect(page.locator('.hero-copy p')).not.toContainText(language === 'en' ? 'Aventure' : 'Adventure')
    results.push({ language, surpriseTranslated: true, genresLocalized: true })
    await page.close()
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2) + '\n')
  console.log(JSON.stringify(results, null, 2))
} finally { await browser.close() }
