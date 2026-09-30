import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { prepareDiscoveryFixtures } from './fixtures/discovery.mjs'
const require = createRequire(new URL('../apps/client/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const output = root + '.impeccable/review/collections'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [1440, 390, 1024]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 390 ? 844 : 900 },
      hasTouch: width < 1100,
      userAgent:
        width < 1100
          ? 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36'
          : undefined,
    })
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await prepareDiscoveryFixtures(page)
    await page.addInitScript(() => {
      const bridge = window.__TAURI_INTERNALS__,
        original = bridge.invoke
      let delayed = false
      window.__qaDelay = (value) => {
        delayed = value
      }
      window.__qaFonts = []
      bridge.invoke = async (command, args = {}) => {
        if (command === 'secure_read' && args.key === 'state' && sessionStorage.getItem('qa-state')) return sessionStorage.getItem('qa-state')
        if (command === 'prepare_subtitle_font') {
          window.__qaFonts.push({ id: args.id, size: args.data.length })
          return { path: '/qa/fonts/test.ttf', directory: '/qa/fonts' }
        }
        if (command === 'remove_subtitle_font') return
        if (command === 'fetch_json' && delayed && args.url.includes('/catalog/'))
          await new Promise((r) => setTimeout(r, 3500))
        const result = await original(command, args)
        if (command === 'secure_read' && args.key === 'state') {
          const state = JSON.parse(result)
          state.collections = [{ id: 'manual', name: 'Weekend', items: ['["movie","qa0"]'] }]
          state.progress = state.progress.map((m) =>
            m.id === 'qa9'
              ? { ...m, name: 'A very long title that must stay on one line in Continue watching' }
              : m,
          )
          state.profiles = state.profiles.map((p) => ({
            ...p,
            progress: state.progress,
            collections: state.collections,
          }))
          return JSON.stringify(state)
        }
        if (command === 'secure_write' && args.key === 'state') {
          sessionStorage.setItem('qa-state', args.value)
          window.__qaState = JSON.parse(args.value)
        }
        return result
      }
    })
    await page.route('**/qa-logo.svg', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="170"><text x="250" y="115" text-anchor="middle" fill="white" font-size="76">QA Story</text></svg>',
      }),
    )
    await page.goto(process.env.PRIMIO_UI_URL ?? 'http://127.0.0.1:9477')
    const nav = page.getByRole('navigation')
    await expect(nav).toBeVisible()
    const capture = async (name) => {
      await page.evaluate(() => document.fonts.ready)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        name + ' page overflow',
      ).toBe(true)
      if (await page.locator('dialog[open]').count())
        expect(
          await page.locator('dialog[open]').evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
          name + ' dialog overflow',
        ).toBe(true)
      await page.screenshot({ path: `${output}/${width}-${name}.png` })
    }
    await expect(page.locator('.continue-card strong').first()).toBeVisible()
    const lines = await page
      .locator('.continue-card strong')
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          height: n.clientHeight,
          line: parseFloat(getComputedStyle(n).lineHeight),
          whiteSpace: getComputedStyle(n).whiteSpace,
          overflow: getComputedStyle(n).textOverflow,
        })),
      )
    expect(
      lines.every(
        (n) => n.height <= n.line + 2 && n.whiteSpace === 'nowrap' && n.overflow === 'ellipsis',
      ),
    ).toBe(true)
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => document.querySelector('[role="status"][aria-label="Loading"]')?.scrollIntoView({ block:'center' }))
      await expect
        .poll(() => page.locator('.recommendation-hint').count())
        .toBeGreaterThanOrEqual(i + 1)
    }
    await expect(page.locator('.recommendation-item').first()).toBeVisible()
    expect(
      (await page.locator('.recommendation-hint').allTextContents()).every(
        (text) => (text.match(/QA (Movie|Series|Anime)/g) ?? []).length <= 2,
      ),
    ).toBe(true)
    await page.locator('.continue-grid').scrollIntoViewIfNeeded()
    await capture('home')
    await nav.getByRole('button', { name: 'Explore', exact: true }).click()
    await expect(page.locator('main:visible .poster-grid .poster').first()).toBeVisible()
    const poster = page.locator('main:visible .poster-grid .poster').first()
    const before = await poster.boundingBox()
    await page.getByRole('button', { name: 'Sort by', exact: true }).click()
    const after = await poster.boundingBox()
    expect(after.y).toBe(before.y)
    expect(
      await page
        .locator('.explorer-sort .choice-options')
        .evaluate((n) => getComputedStyle(n).position),
    ).toBe('absolute')
    await capture('explorer-sort')
    await page.keyboard.press('Escape')
    await nav.getByRole('button', { name: 'My list', exact: true }).click()
    expect(await page.locator('.library-title').evaluate((n) => getComputedStyle(n).alignItems)).toBe('center')
    const count = await page.locator('.library-title-count').boundingBox()
    const heading = await page.locator('.library-title').boundingBox()
    expect(Math.abs(count.y + count.height / 2 - heading.y - heading.height / 2)).toBeLessThanOrEqual(1)
    await expect(page.locator('.collection-toolbar .choice')).toHaveCount(1)
    await page.getByRole('button', { name: 'Collection', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Weekend · 1', exact: true })).toBeVisible()
    await capture('collection-dropdown')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Create collection', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Collection', exact: true })
    await dialog.getByLabel('Name', { exact: true }).fill('My next anime')
    await dialog.getByRole('button', { name: 'Automatic', exact: true }).click()
    await dialog.getByRole('button', { name: 'Anime to watch', exact: true }).click()
    await expect(dialog.locator('.collection-preview strong')).toContainText('0 titles')
    // Change to an OR group: anime OR to-watch. All anime are already in progress in this fixture.
    await dialog.getByRole('button', { name: 'Include when', exact: true }).click()
    await dialog.getByRole('button', { name: 'Any condition (OR)', exact: true }).click()
    await expect(dialog.locator('.collection-preview strong')).toContainText('3 titles')
    await capture('rules')
    await dialog.getByRole('button', { name: 'Criterion 1', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.choice-options')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Add a group', exact: true }).click()
    await expect(dialog.locator('.rule-group')).toHaveCount(2)
    await dialog.getByRole('button', { name: 'Combine groups', exact: true }).click()
    await dialog.getByRole('button', { name: 'Any group (OR)', exact: true }).click()
    await dialog.getByRole('button', { name: 'Remove group 2', exact: true }).click()
    await dialog.locator('.collection-extra').first().locator('summary').click()
    await dialog.getByRole('button', { name: 'Sort by', exact: true }).click()
    await dialog.getByRole('button', { name: 'Rating', exact: true }).click()
    await dialog.getByRole('button', { name: 'Ascending order', exact: true }).click()
    await dialog.getByRole('button', { name: 'Add a sort criterion', exact: true }).click()
    await capture('sorting')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('main:visible .poster-grid .poster')).toHaveCount(3)
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.__qaState?.collections?.find((c) => c.name === 'My next anime')?.rules?.groups[0]
              .match,
        ),
      )
      .toBe('any')
    expect(
      await page.evaluate(
        () => window.__qaState.collections.find((c) => c.name === 'My next anime').sortRules,
      ),
    ).toEqual([
      { key: 'rating', direction: 'desc' },
      { key: 'manual', direction: 'asc' },
    ])
    await capture('smart-library')
    // A manual removal must override matching rules rather than reappearing immediately.
    const title = page.locator('main:visible .poster-grid .poster').first()
    await title.dispatchEvent('contextmenu')
    await page.getByRole('button', { name: 'Remove from collection', exact: true }).click()
    await expect(page.locator('main:visible .poster-grid .poster')).toHaveCount(2)
    await page.getByRole('button', { name: 'Edit collection', exact: true }).click()
    const remove = dialog.getByRole('button', { name: 'Delete', exact: true })
    await expect(remove).toBeVisible()
    expect(await remove.evaluate((n) => getComputedStyle(n).color)).toBe('rgb(255, 156, 156)')
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    if (width === 1440) {
      await page.getByRole('button', { name:'Collection', exact:true }).click()
      await page.getByRole('button', { name:'All · 10', exact:true }).click()
      await page.locator('main:visible .poster').filter({ hasText:'QA Movie 0' }).click()
      await page.evaluate(() => window.__qaDelay(true))
      const previous = await page.locator('.recommendation-item .poster strong').allTextContents()
      await page.getByRole('button', { name:'Remove from my list', exact:true }).click()
      await page.evaluate(() => window.dispatchEvent(new Event('primio:back')))
      await nav.getByRole('button', { name:'Home', exact:true }).click()
      await expect(page.locator('.shelf .poster-rail[aria-busy=true]').first()).toBeAttached()
      expect(await page.locator('.recommendation-item .poster strong').allTextContents()).toEqual(previous)
      await page.locator('.recommendation-hint').first().scrollIntoViewIfNeeded()
      await capture('recommendations-refresh')
      await expect(page.locator('.shelf .poster-rail[aria-busy=true]')).toHaveCount(0, { timeout:10000 })
      await page.evaluate(() => window.__qaDelay(false))
    }
    await nav.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: /^Options / }).click()
    const fontChoice = page.getByRole('button', { name: 'Interface font', exact: true })
    await fontChoice.click()
    await expect(page.locator('.interface-font-settings .choice-options button')).toHaveCount(5)
    await capture('font-options')
    await page.getByRole('button', { name: 'Manrope', exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily))
      .toContain('Manrope')
    await expect
      .poll(() => page.evaluate(() => document.fonts.check('400 16px Manrope')))
      .toBe(true)
    await page
      .getByLabel('Import a font', { exact: true })
      .setInputFiles(root + 'apps/client/src/assets/fonts/lora.ttf')
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('primio.interface-font')?.length))
      .toBe(64)
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily))
      .toContain('primio-')
    await capture('font-import')
    await expect.poll(() => page.evaluate(() => window.__qaState?.settings.interfaceFont)).toBe('manrope')
    await page.reload()
    await expect(nav).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily))
      .toContain('primio-')
    await nav.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: /^Options / }).click()
    await page.getByRole('button', { name: 'Delete imported font', exact: true }).click()
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).fontFamily))
      .toContain('Manrope')
    await page.evaluate(() => window.dispatchEvent(new Event('primio:back')))
    await page.getByRole('button', { name: /^Player / }).click()
    await page.getByRole('button', { name: 'Font', exact: true }).click()
    await expect(page.locator('.choice-options button')).toHaveCount(5)
    await page.getByRole('button', { name: 'JetBrains Mono', exact: true }).click()
    await expect
      .poll(() =>
        page.locator('.subtitle-preview > span').evaluate((n) => getComputedStyle(n).fontFamily),
      )
      .toContain('JetBrains Mono')
    const native = await page.evaluate(async () => {
      const { customFontOptions } = await import('/src/subtitle-fonts.ts')
      return await customFontOptions('jetbrains')
    })
    expect(native).toMatchObject({
      subtitleFont: 'custom',
      customFont: { family: 'JetBrains Mono', path: '/qa/fonts/test.ttf' },
    })
    await capture('subtitle-font')
    expect(errors).toEqual([])
    results.push({
      width,
      overflow: false,
      consoleErrors: errors,
      savedRules: true,
      explicitExclusion: true,
      nativeFont: native.customFont.family,
    })
    await page.close()
  }
  await writeFile(output + '/report.json', JSON.stringify(results, null, 2) + '\n')
  console.log(JSON.stringify(results))
} finally {
  await browser.close()
}
