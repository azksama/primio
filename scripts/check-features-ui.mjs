import { prepareDiscoveryFixtures } from './fixtures/discovery.mjs'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
const require = createRequire(new URL('../apps/client/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const browser = await chromium.launch({ headless: true })
const output = new URL('../tmp/validation-v0212/', import.meta.url).pathname.replace(
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
  await prepareDiscoveryFixtures(page, { variant: 'features' })

  await page.clock.install()
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:1420')
  const nav = page.getByRole('navigation')
  await expect(nav).toBeVisible()
  await expect(page.locator('.hero-pagination button')).toHaveCount(4)
  await expect(page.locator('.hero')).toHaveAttribute('data-category', 'movie')
  await page.clock.fastForward(15000)
  await expect(page.locator('.hero')).toHaveAttribute('data-category', 'series')
  await page.clock.fastForward(15000)
  await expect(page.locator('.hero')).toHaveAttribute('data-category', 'anime')
  await page.clock.fastForward(15000)
  await expect(page.locator('.hero')).toHaveAttribute('data-category', 'movie')
  await page.getByRole('button', { name: 'Pause slideshow' }).click()
  await page.clock.fastForward(30000)
  await expect(page.locator('.hero')).toHaveAttribute('data-category', 'movie')
  await page.clock.resume()

  await nav.getByRole('button', { name: 'My list', exact: true }).click()
  await page.getByRole('button', { name: 'Create collection', exact: true }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Weekend')
  await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Collection', exact: true })).toContainText(
    'Weekend · 0',
  )
  await page.getByRole('button', { name: 'Collection', exact: true }).click()
  await page.getByRole('button', { name: 'All · 10', exact: true }).click()
  const first = page.locator('main:visible .selectable-poster').first()
  const box = await first.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.up()
  await page.locator('main:visible .selectable-poster').nth(1).click()
  await expect(page.locator('main:visible .is-selected')).toHaveCount(2)
  await page.screenshot({ path: output + '/collection-selection-local.png' })
  await page.getByRole('button', { name: 'Add to collection', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Weekend/ })
    .click()
  await page.getByRole('button', { name: 'Collection', exact: true }).click()
  await page.getByRole('button', { name: 'Weekend · 2', exact: true }).click()
  await expect(page.locator('main:visible .selectable-poster')).toHaveCount(2)
  await page.screenshot({ path: output + '/collection.png' })
  await page.getByRole('button', { name: 'Edit collection', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Collection', exact: true }).click()
  await expect(page.getByRole('button', { name: /Weekend/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await nav.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /Connected services/ }).click()
  await expect(page.getByText('Sign in to sync your services.')).toBeVisible()
  await nav.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /Diagnostic/ }).click()
  await expect(page.getByRole('button', { name: 'Send report', exact: true })).toBeDisabled()
  await page.screenshot({ path: output + '/diagnostics.png' })
  await page.addInitScript(() => {
    const original = window.__TAURI_INTERNALS__.invoke
    let serverState = JSON.parse(sessionStorage.getItem('importServer') ?? 'null'),
      version = Number(sessionStorage.getItem('importVersion') ?? 0),
      failure = true
    window.oauthCalls = []
    window.importOffline = sessionStorage.getItem('importOffline') === 'true'
    window.inspectImportSync = () => ({
      serverState,
      local: JSON.parse(sessionStorage.getItem('importState') ?? 'null'),
    })
    window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (
        command === 'secure_read' &&
        args.key === 'state' &&
        sessionStorage.getItem('importState')
      )
        return sessionStorage.getItem('importState')
      if (command === 'secure_write' && args.key === 'state')
        sessionStorage.setItem('importState', args.value)
      if (command === 'secure_read' && args.key === 'startupProfile')
        return JSON.stringify({ account: 'qa@example.org', profileId: 'main' })
      if (command === 'secure_read' && args.key === 'session')
        return JSON.stringify({ token: 'qa-token', email: 'qa@example.org', version: 0 })
      if (command === 'api_request') {
        if (args.path === '/account/progress') return { profiles: serverState?.profiles ?? [] }
        if (args.path === '/account/sync') {
          if (window.importOffline) throw { status: 503, message: 'Offline test' }
          if (args.method === 'PUT') {
            serverState = args.body.state
            version++
            sessionStorage.setItem('importServer', JSON.stringify(serverState))
            sessionStorage.setItem('importVersion', String(version))
            window.oauthCalls.push('sync')
            return { version }
          }
          return { version, state: serverState }
        }
        if (args.path === '/account/integrations') {
          if (args.method === 'GET')
            return {
              connections: [],
              providers: ['trakt', 'anilist', 'mal'].map((provider) => ({
                provider,
                configured: true,
              })),
            }
          window.oauthCalls.push(args.body.provider)
          if (failure) {
            failure = false
            throw { message: 'Connection test error', status: 503 }
          }
          return { url: 'https://provider.example/authorize/' + args.body.provider }
        }
      }
      if (command === 'provider_request') {
        if (args.operation === 'stremioLogin')
          return { result: { authKey: 'temporary-stremio-token' } }
        if (args.operation === 'stremioLibrary')
          return { result: [{ _id: 'ttimported', type: 'movie', name: 'Imported Stremio movie' }] }
        if (args.operation === 'stremioAddons')
          return {
            result: {
              addons: [
                { transportUrl: 'https://import.example/manifest.json' },
                { transportUrl: 'https://excluded.example/manifest.json' },
              ],
            },
          }
      }
      if (command === 'open_link') {
        window.oauthCalls.push(args.url)
        return
      }
      return original(command, args)
    }
  })
  await page.reload()
  await nav.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /Connected services/ }).click()
  await page.getByRole('button', { name: 'Connect', exact: true }).first().click()
  await expect(page.getByRole('alert')).toContainText('Connection test error')
  await page.getByRole('button', { name: 'Connect', exact: true }).first().click()
  await expect
    .poll(() =>
      page.evaluate(() => window.oauthCalls.includes('https://provider.example/authorize/trakt')),
    )
    .toBe(true)
  expect(await page.evaluate(() => window.oauthCalls.slice(0, 2))).toEqual(['sync', 'trakt'])
  await nav.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /Import a library/ }).click()
  const imports = page.getByRole('dialog')
  await imports.locator('input[name="user"]').fill('stremio@example.org')
  await imports.locator('input[name="password"]').fill('temporary-password')
  await imports.getByRole('button', { name: 'Preview import', exact: true }).click()
  await expect(imports.getByText('Imported Stremio movie')).toBeVisible()
  await imports
    .locator('.import-addon')
    .filter({ hasText: 'excluded.example' })
    .locator('input')
    .uncheck()
  await page.evaluate(() => {
    window.importOffline = true
    sessionStorage.setItem('importOffline', 'true')
  })
  await imports.getByRole('button', { name: 'Import', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => window.inspectImportSync().local?.pendingImports?.length))
    .toBe(1)
  expect(await page.evaluate(() => JSON.stringify(window.inspectImportSync().local))).not.toContain(
    'temporary-password',
  )
  expect(await page.evaluate(() => JSON.stringify(window.inspectImportSync().local))).not.toContain(
    'temporary-stremio-token',
  )
  await page.reload()
  await nav.getByRole('button', { name: 'My list', exact: true }).click()
  await expect(page.getByText('Import saved. Waiting to sync.')).toBeVisible()
  await page.evaluate(() => {
    window.importOffline = false
    sessionStorage.removeItem('importOffline')
    window.dispatchEvent(new Event('online'))
  })
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.inspectImportSync().serverState?.library.some((item) => item.id === 'ttimported'),
      ),
    )
    .toBe(true)
  await expect
    .poll(() => page.evaluate(() => window.inspectImportSync().local?.pendingImports?.length))
    .toBe(0)
  const importedServer = await page.evaluate(() => window.inspectImportSync().serverState)
  expect(
    importedServer.addons.some((addon) => addon.url === 'https://import.example/manifest.json'),
  ).toBe(true)
  expect(
    importedServer.addons.some((addon) => addon.url === 'https://excluded.example/manifest.json'),
  ).toBe(false)
  expect(importedServer.profiles[0].library.some((item) => item.id === 'ttimported')).toBe(true)
  expect(importedServer.pendingImports).toBeUndefined()
  expect(errors).toEqual([])
  console.log(
    'Collections, services, diagnostics and automatic Stremio import synchronization after offline restart passed with mock bridge.',
  )

  // Imported fonts persist locally, render in the preview, and can be removed.
  await nav.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Player Playback/ }).click()
  const fontFile = 'apps/client/src-tauri/resources/windows/player/fonts/inter.ttf'
  await page.getByLabel('Import a font', { exact: true }).setInputFiles(fontFile)
  await expect(page.getByRole('button', { name: 'Font', exact: true })).toContainText('Inter')
  await expect
    .poll(() =>
      page.locator('.subtitle-preview > span').evaluate((el) => getComputedStyle(el).fontFamily),
    )
    .toContain('primio-')
  await page.reload()
  await nav.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: /^Player Playback/ }).click()
  await expect(page.getByRole('button', { name: 'Font', exact: true })).toContainText('Inter')
  await page.screenshot({ path: output + '/phone-imported-font.png' })
  await page.getByRole('button', { name: 'Delete imported font' }).click()
  await expect(page.getByRole('button', { name: 'Delete imported font' })).toHaveCount(0)
  await page
    .getByLabel('Import a font', { exact: true })
    .setInputFiles({
      name: 'invalid.ttf',
      mimeType: 'font/ttf',
      buffer: Buffer.from('invalid font'),
    })
  await expect(page.getByRole('alert')).toContainText('Invalid font')
  for (const desktop of [false, true]) {
    await page.setViewportSize({ width: desktop ? 1280 : 390, height: desktop ? 850 : 844 })
    await page.evaluate(
      (desktop) => document.documentElement.classList.toggle('desktop', desktop),
      desktop,
    )
    for (const target of ['Addons', 'Plugins']) {
      await nav.getByRole('button', { name: 'Settings', exact: true }).click()
      await page.getByRole('button', { name: new RegExp('^' + target + ' ') }).click()
      const title = await page.locator('.management-heading h1').boundingBox()
      const action = await page.locator('.management-action').boundingBox()
      if (desktop) expect(action.x).toBeGreaterThan(title.x + title.width)
      else expect(action.y).toBeGreaterThan(title.y + title.height)
      expect(action.y + action.height).toBeLessThan(250)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: output + '/' + (desktop ? 'desktop' : 'phone') + '-' + target.toLowerCase() + '.png',
      })
    }
    if (desktop) {
      const active = await nav.locator('button.active').boundingBox()
      expect(active.width).toBeLessThan(135)
      expect(active.height).toBeLessThanOrEqual(58)
    }
  }
  expect(errors).toEqual([])
  console.log(
    'Imported fonts, persistence, removal, invalid files, responsive management actions and compact desktop navigation passed.',
  )
} catch (error) {
  await page.screenshot({ path: output + '/failure.png', fullPage: true })
  console.error(await page.locator('main:visible').ariaSnapshot())
  throw error
} finally {
  await browser.close()
}
