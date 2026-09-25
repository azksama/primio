import { chromium, expect } from '../apps/client/node_modules/@playwright/test/index.mjs'
import { mkdir } from 'node:fs/promises'
const output = 'tmp/validation-v029'
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
try {
  for (const [width, height] of [
    [390, 844],
    [1280, 800],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route('https://v3-cinemeta.strem.io/**', (route) =>
      route.fulfill({
        json: {
          id: 'cinemeta',
          name: 'Cinemeta',
          version: '1.0.0',
          types: ['movie', 'series'],
          resources: [],
          catalogs: [],
        },
      }),
    )
    await page.route('https://primio-api.azks.fr/**', async (route) => {
      const url = route.request().url()
      if (url.endsWith('/signup'))
        return route.fulfill({
          json: {
            verificationRequired: true,
            challenge: 'a'.repeat(64),
            email: 'viewer@example.org',
            retryAfter: 0,
          },
        })
      if (url.endsWith('/verify-email')) {
        if (route.request().postDataJSON().code !== '123456')
          return route.fulfill({
            status: 422,
            json: { message: 'Code incorrect ou expiré. Demandez un nouveau code.' },
          })
        return route.fulfill({ json: { token: 'fixture', user: { username: 'viewer' } } })
      }
      if (url.endsWith('/resend-code'))
        return route.fulfill({
          json: {
            verificationRequired: true,
            challenge: 'b'.repeat(64),
            email: 'viewer@example.org',
            retryAfter: 60,
          },
        })
      if (url.endsWith('/sync')) return route.fulfill({ json: { version: 1, state: null } })
      if (url.endsWith('/progress')) return route.fulfill({ json: { profiles: [] } })
      return route.fulfill({
        json: {
          version: '0.2.8',
          url: 'https://github.com/azksama/primio/releases/tag/v0.2.8-preview.1',
        },
      })
    })
    await page.goto('http://127.0.0.1:1420')
    await expect(page.locator('.onboarding')).toBeVisible()
    await expect(page.locator('.onboarding-body')).toContainText('Your Primio account')
    await page.screenshot({ path: `${output}/account-first-${width}.png` })
    await page.getByRole('button', { name: 'Create an account or log in' }).click()
    await page.locator('input[name=username]').fill('viewer')
    await page.locator('input[name=email]').fill('viewer@example.org')
    await page.locator('input[name=password]').fill('Strong-Password-2026')
    await page.locator('input[name=passwordConfirmation]').fill('Strong-Password-2026')
    await page.locator('input[name=terms]').check()
    await page.locator('form .primary').click()
    await expect(page.locator('.verification-code')).toBeVisible()
    await page.locator('.verification-code').fill('000000')
    await page.getByRole('button', { name: 'Confirm my email' }).click()
    await expect(page.getByRole('alert')).toContainText('Incorrect or expired code')
    await page.getByRole('button', { name: 'Resend code' }).click()
    await expect(page.getByRole('button', { name: /Resend code/ })).toBeDisabled()
    await page.screenshot({ path: `${output}/email-code-${width}.png` })
    await page.locator('.verification-code').fill('123456')
    await page.getByRole('button', { name: 'Confirm my email' }).click()
    await expect(page.locator('.verification-code')).toHaveCount(0)
    await expect(page.locator('.onboarding-body')).toContainText('You are signed in')
    expect(errors).toEqual([])
    await page.close()
  }
  console.log(
    'PASS account-first onboarding, email code, rejected code, resend, successful verification on phone and desktop',
  )
} finally {
  await browser.close()
}
