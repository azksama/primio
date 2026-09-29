import { prepareDiscoveryFixtures } from './fixtures/discovery.mjs'
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
await page.route('**/qa-logo.svg', route => route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="500" height="170"><text x="250" y="115" text-anchor="middle" fill="white" font-family="Georgia" font-size="76">After the rain</text></svg>'}))
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await prepareDiscoveryFixtures(page)

try {
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:1420')
  const nav = page.getByRole('navigation')
  await expect(nav).toBeVisible()
  await page.getByRole('button', { name: 'Configure TMDB', exact:true }).click()
  await page.getByLabel('API Read Access Token').fill('invalid-token')
  await page.getByRole('button', { name:'Verify and save',exact:true }).click()
  await expect(page.locator('.metadata-settings [role=alert]')).toBeVisible()
  await page.getByLabel('API Read Access Token').fill('private-ui-token')
  await page.getByRole('button', { name:'Verify and save',exact:true }).click()
  await expect(page.locator('.metadata-heading')).toContainText('Connected')
  expect(await page.getByLabel('API Read Access Token').inputValue()).toBe('')
  expect(await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('secure_read',{key:'state'}))).not.toContain('private-ui-token')
  await page.screenshot({path:output+'/metadata-settings.png'})
  await nav.getByRole('button',{name:'Home',exact:true}).click()
  await page.locator('.random-pick').getByRole('button', { name: 'Refine my picks' }).click()
  await page.locator('.random-pick').getByLabel('Type',{exact:true}).selectOption('movie')
  await page
    .locator('.random-pick')
    .getByRole('button', { name: 'Surprise me', exact: true })
    .click()
  await expect(page.locator('.random-result')).toBeVisible()
  expect(await page.evaluate(()=>window.__randomCalls)).toBe(1)
  await page.locator('.random-result').click()
  await expect(page.locator('.detail-logo')).toBeVisible()
  await expect(page.locator('.copy-title')).toHaveText('QA Movie 0')
  await page.screenshot({path:output+'/detail-logo.png'})
  await page.locator('.detail-toolbar').getByRole('button',{name:'Back',exact:true}).click()
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

  await firstResult.click()
  await page.evaluate(()=>window.__holdFirstStreams=true)
  await page.getByRole('button',{name:'Continue watching',exact:true}).click()
  const sources=page.locator('.sources')
  await expect(sources.locator('.compact-source')).toHaveCount(3)
  await expect(sources.locator('.source-addons button').nth(1)).toContainText('QA Catalog')
  await expect(sources.locator('.source-addons button').nth(1).locator('.spin')).toBeVisible()
  await sources.locator('.compact-source').first().evaluate(el=>window.__earlySource=el)
  await page.screenshot({path:output+'/sources-progressive.png'})
  await page.evaluate(()=>{window.__holdFirstStreams=false;window.__releaseStreams()})
  await expect(sources.locator('.compact-source')).toHaveCount(6)
  expect(await sources.locator('.compact-source').nth(3).evaluate(el=>el===window.__earlySource)).toBe(true)
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()
  await page.getByRole('button',{name:'Back',exact:true}).first().click()
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
