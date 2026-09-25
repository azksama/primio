import { chromium, expect } from '../apps/client/node_modules/@playwright/test/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
const browser = await chromium.launch({ headless: true })
const output = 'tmp/validation-v029'
await mkdir(output, { recursive: true })
const findings = []
for (const [name, width, height, touch] of [
  ['phone', 390, 844, true],
  ['small-phone', 320, 640, true],
  ['tablet', 800, 1280, true],
  ['desktop', 1280, 800, false],
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    hasTouch: touch,
    userAgent: touch
      ? 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36'
      : undefined,
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    const store = {}
    window.__qaStore = store
    window.isTauri = true
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
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
        if (command === 'fetch_json')
          return {
            id: 'fixture',
            name: 'Catalog',
            version: '1',
            types: ['movie', 'series'],
            resources: [],
            catalogs: [],
            metas: [],
          }
        if (command === 'plugin:event|listen') return 1
        if (command === 'download_list') return { items: [] }
        if (command === 'provider_request') {
          if (args.operation === 'stremioLogin') return { result: { authKey: 'test-only' } }
          if (args.operation === 'stremioAddons')
            return {
              result: {
                addons: [
                  {
                    transportUrl: 'https://example.org/manifest.json',
                    manifest: { name: 'Keep addon' },
                  },
                  {
                    transportUrl: 'https://second.example.org/manifest.json',
                    manifest: { name: 'Skip addon' },
                  },
                ],
              },
            }
          if (args.operation === 'stremioLibrary')
            return {
              result: { items: [{ _id: 'tt1234567', type: 'movie', name: 'Imported film' }] },
            }
        }
        return null
      },
    }
  })
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:1420')
  await expect(page.locator('.onboarding')).toBeVisible()
  for (let step = 1; step <= 7; step++) {
    const dimensions = await page.locator('.onboarding-body').evaluate((e) => ({
      scroll: e.scrollHeight,
      client: e.clientHeight,
      width: e.scrollWidth,
      clientWidth: e.clientWidth,
    }))
    findings.push({ name, step, ...dimensions })
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.clientWidth + 1)
    const footer = await page.locator('.onboarding-footer').boundingBox()
    expect(footer.y + footer.height).toBeLessThanOrEqual(height + 1)
    await page.screenshot({ path: `${output}/${name}-onboarding-${step}.png` })
    if (step === 5 && name === 'phone') {
      await page.locator('.import-panel input[name=user]').fill('fixture@example.org')
      await page.locator('.import-panel input[name=password]').fill('Fixture-password')
      await page.getByRole('button', { name: 'Preview import', exact: true }).click()
      await expect(page.locator('.import-preview')).toContainText('Imported film')
      await expect(
        page.locator('.import-preview').getByRole('switch', { name: '2 addons installed' }),
      ).toBeVisible()
      await expect(page.locator('.import-addon input')).toHaveCount(2)
      await page.locator('.import-addon input').nth(1).uncheck()
      await page.locator('.import-preview .primary').click()
      await expect(page.locator('.onboarding-import [role=status]')).toContainText(
        'Import complete',
      )
      await expect(page.locator('.onboarding-footer .primary')).toContainText('Continue')
      await expect
        .poll(() => page.evaluate(() => JSON.stringify(window.__qaStore)))
        .toContain('https://example.org/manifest.json')
      expect(await page.evaluate(() => JSON.stringify(window.__qaStore))).not.toContain(
        'https://second.example.org/manifest.json',
      )
      await page.screenshot({ path: `${output}/phone-onboarding-import-complete.png` })
    }
    if (step < 7) await page.locator('.onboarding-footer .primary').click()
  }
  expect(errors).toEqual([])
  await page.close()
}
await writeFile(`${output}/onboarding-layout.json`, JSON.stringify(findings, null, 2))
console.log(
  JSON.stringify(
    findings.filter((f) => f.scroll > f.client + 2),
    null,
    2,
  ),
)
await browser.close()
