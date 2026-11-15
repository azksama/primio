// Real React UI with an isolated, shared account fixture; not a native-device test.
import { chromium, expect } from '../apps/client/node_modules/@playwright/test/index.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
const output = 'tmp/feedback-20261115/browser'
await mkdir(output, { recursive: true })
const origin = process.env.PRIMIO_UI_URL ?? 'http://127.0.0.1:1420'
const browser = await chromium.launch()
const clone = value => structuredClone(value)
const settings = { uiLanguage: 'fr', reduceMotion: true, skipIntro: false, aniSkip: false }
const series = { id: 'qa-show', type: 'series', name: 'Série de validation', genres: ['Drama'],
  videos: [{ id: 'qa:1', season: 1, episode: 1, title: 'Premier épisode' }, { id: 'qa:2', season: 1, episode: 2, title: 'Deuxième épisode' }] }
const profiles = ['Alice', 'Bob'].map((name, i) => ({ id: i ? 'bob' : 'main', name, avatar: i ? '02' : '01',
  color: '#DAD4C5', settings, library: [series], progress: [] }))
let remote = { ...profiles[0], profiles, activeProfileId: 'main', addons: [
  { url: 'https://qa.example/first/manifest.json', enabled: true },
  { url: 'https://qa.example/second/manifest.json', enabled: true },
] }
let version = 0, hold = false, release, held = false
const events = [], errors = []
async function request({ path, method, body }) {
  events.push({ path, method, at: Date.now() })
  if (path.startsWith('/auth/')) return { token: 'fixture-token', user: { username: 'Alice' } }
  if (path === '/account/logout') return { fixtureError: 'offline', status: 503 }
  if (path === '/account/sync/version') return { version }
  if (path === '/account/sync') {
    if (method !== 'PUT') return { version, state: clone(remote) }
    if (hold) { hold = false; held = true; await new Promise(resolve => { release = resolve }); held = false }
    if (body.version !== version) return { fixtureError: 'Conflict', status: 409 }
    remote = clone(body.state)
    return { version: ++version }
  }
  if (path === '/account/progress') {
    const before = JSON.stringify(remote)
    for (const profile of remote.profiles) {
      const incoming = body.profiles.find(p => p.id === profile.id)
      for (const item of incoming?.progress ?? []) {
        const old = profile.progress.find(p => p.type === item.type && p.videoId === item.videoId)
        if (!old || item.updatedAt > old.updatedAt) {
          profile.progress = profile.progress.filter(p => p.type !== item.type || p.videoId !== item.videoId)
          profile.progress.push(clone(item))
        }
      }
      if (profile.id === remote.activeProfileId) remote.progress = profile.progress
    }
    if (JSON.stringify(remote) !== before) version++
    return { profiles: remote.profiles.map(({ id, progress }) => ({ id, progress: clone(progress) })) }
  }
  if (path === '/account/integrations') return { connections: [], providers: [] }
  return { items: [], version: '1.0.1', platforms: {} }
}
async function pageFor(width, connected = true) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, ...(width < 600 ? { userAgent: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/145.0 Mobile Safari/537.36' } : {}) })
  page.on('pageerror', error => errors.push(error.message))
  await page.exposeFunction('fixtureApi', request)
  await page.addInitScript(({ state, connected }) => {
    const store = window.fixtureStore = {
      state: JSON.stringify(state),
      session: JSON.stringify(connected ? { token: 'fixture-token', email: 'qa@example.invalid', version: 0 } : {}),
      onboarding: connected ? 'done' : '',
      startupProfile: JSON.stringify({ account: 'qa@example.invalid', profileId: 'main' }),
    }
    window.isTauri = true
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback() { return 1 }, unregisterCallback() {},
      async invoke(command, args = {}) {
        if (command === 'native_auth') return { token: 'fixture-token', user: { username: 'Alice' }, email: 'qa@example.invalid', register: false }
        if (command === 'secure_read') return store[args.key] ?? null
        if (command === 'secure_write') { store[args.key] = args.value; return }
        if (command === 'api_request') {
          const result = await window.fixtureApi(args)
          if (result?.fixtureError) throw Object.assign(Error(result.fixtureError), { status: result.status })
          return result
        }
        if (command === 'fetch_json') {
          if (args.url.includes('manifest')) return { id: args.url.includes('first') ? 'first' : 'second', name: args.url.includes('first') ? 'Premier addon' : 'Second addon', version: '1.0.0', types: ['series'], resources: ['catalog', 'meta'], catalogs: [{ id: 'qa', type: 'series' }] }
          if (args.url.includes('/meta/')) return { meta: state.library[0] }
          return { metas: state.library, streams: [] }
        }
        if (command === 'download_list') return { items: [] }
        if (command === 'plugin:event|listen') return 1
        return null
      },
    }
  }, { state: clone(remote), connected })
  await page.route('https://**', route => route.fulfill({ json: {} }))
  await page.goto(origin)
  return page
}
const saved = page => page.evaluate(() => JSON.parse(window.fixtureStore.state))
const nav = (page, text) => page.locator('.bottom-nav').getByRole('button', { name: text, exact: true }).click()
async function addons(page) {
  await nav(page, 'Paramètres')
  await page.getByRole('button', { name: /Addons.*Catalogues/ }).click()
  await expect(page.locator('.addon-card')).toHaveCount(2)
}
try {
  const a = await pageFor(1440), b = await pageFor(1280)
  await expect.poll(() => a.evaluate(() => !!window.fixtureStore.accountSync)).toBe(true)
  await addons(a); await addons(b)
  const start = Date.now()
  await a.locator('.addon-card').first().getByRole('switch').click()
  await expect.poll(() => remote.addons[0].enabled, { timeout: 1000 }).toBe(false)
  const uploadMs = Date.now() - start
  await expect(b.locator('.addon-card').first().getByRole('switch')).toHaveAttribute('aria-checked', 'false', { timeout: 5000 })
  const receptionMs = Date.now() - start
  // A second change during a delayed first upload must be sent after it.
  hold = true
  await a.locator('.addon-card').first().getByRole('switch').click()
  await expect.poll(() => held).toBe(true)
  await a.locator('.addon-card').nth(1).getByRole('switch').click()
  release()
  await expect.poll(() => remote.addons.map(p => p.enabled)).toEqual([true, false])
  await expect(b.locator('.addon-card').nth(1).getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  await a.screenshot({ path: output + '/addons-synchronized.png' })
  await nav(a, 'Ma liste')
  await a.getByRole('button', { name: 'Série de validation', exact: true }).first().click()
  await a.getByRole('button', { name: /Marquer comme vu :/ }).first().click()
  await expect.poll(() => remote.profiles[0].progress.find(p => p.videoId === 'qa:1')?.watched, { timeout: 1000 }).toBe(true)
  await expect.poll(async () => (await saved(b)).profiles[0].progress.find(p => p.videoId === 'qa:1')?.watched, { timeout: 5000 }).toBe(true)
  await a.close(); await b.close()
  for (const width of [390, 1440]) {
    const page = await pageFor(width, false)
    await page.getByRole('button', { name: 'Créer un compte ou se connecter' }).click()
    if (width >= 600) {
      await page.getByRole('button', { name: 'Déjà un compte ? Se connecter' }).click()
      await page.locator('input[name=email]').fill('qa@example.invalid')
      await page.locator('input[name=password]').fill('Fixture-password-only')
      await page.locator('form .primary').click()
    }
    await expect(page.locator('.profile-picker')).toBeVisible()
    await expect(page.locator('.profile-picker')).toContainText('Alice')
    await expect(page.locator('.profile-picker')).toContainText('Bob')
    await page.screenshot({ path: `${output}/sessions-${width}.png` })
    await page.getByRole('button', { name: 'Créer ma session', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Créer ma session' })
    await dialog.getByRole('textbox', { name: 'Nom du profil' }).fill(`Camille ${width}`)
    await dialog.getByRole('button', { name: 'Créer ma session' }).click()
    await expect(page.locator('.profile-picker')).toHaveCount(0)
    await expect.poll(() => remote.profiles.some(p => p.name === `Camille ${width}`)).toBe(true)
    expect(remote.profiles[0].name).toBe('Alice')
    await nav(page, 'Paramètres')
    await page.getByRole('button', { name: /Compte et profils/ }).click()
    const logoutAt = Date.now()
    await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click()
    await expect(page.locator('.onboarding')).toBeVisible({ timeout: 1500 })
    expect(Date.now() - logoutAt).toBeLessThan(1500)
    expect(await page.evaluate(() => JSON.parse(window.fixtureStore.session).token)).toBe('')
    await page.reload()
    // The fixture reinjects storage on reload, so durable writes are checked above.
    await page.close()
  }
  expect(errors).toEqual([])
  await writeFile(output + '/results.json', JSON.stringify({ uploadMs, receptionMs, queuedEdits: true,
    episodeWatched: true, sessionCreation: true, offlineLogout: true, widths: [390, 1440], requests: events.length }, null, 2))
  console.log('PASS immediate addon/progress uploads, second device reception, in-flight edits, existing sessions, new session and offline logout')
} finally { await browser.close() }
