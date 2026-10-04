// Browser fixtures only: the simulated bridge does not validate native devices.
import { chromium, expect } from '@playwright/test'

const origin = process.argv[2] ?? 'http://127.0.0.1:1420'
const browser = await chromium.launch({ headless: true })
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      const settings = { uiLanguage: 'en', skipIntro: false, aniSkip: false, reduceMotion: true }
      const film = { id: 'fixture', type: 'movie', name: 'Saved fixture', description: 'Fixture synopsis', genres: ['Drama'] }
      const profile = { id: 'main', name: 'First', avatar: '01', color: '#DAD4C5', library: [film], progress: [], settings }
      const second = { ...profile, id: 'second', name: 'Second', avatar: '02', library: [] }
      const state = { ...profile, addons: [{ url: 'https://fixture.invalid/manifest.json', enabled: true }], activeProfileId: 'main', profiles: [profile, second] }
      const store = {
        state: JSON.stringify(state), session: JSON.stringify({ token: 'fixture-token', email: 'fixture@example.invalid', version: 0 }),
        onboarding: 'done', startupProfile: JSON.stringify({ account: 'fixture@example.invalid', profileId: 'main' }),
      }
      const fixture = window.auditFixture = { store, writes: [], commands: [], failRead: true, remote: null, version: 0, delaySubtitles: false, subtitleWaiting: false }
      window.isTauri = true
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => 1, unregisterCallback() {},
        async invoke(command, args = {}) {
          fixture.commands.push(command)
          if (command === 'secure_read') {
            if (args.key === 'state' && fixture.failRead) throw Error('fixture storage unavailable')
            return store[args.key] ?? null
          }
          if (command === 'secure_write') { fixture.writes.push(args.key); store[args.key] = args.value; return }
          if (command === 'api_request') {
            if (args.path === '/account/sync') {
              if (args.method === 'PUT') { fixture.remote = args.body.state; return { version: ++fixture.version } }
              return { version: fixture.version, state: fixture.remote }
            }
            if (args.path === '/account/progress') return { profiles: [] }
            if (args.path === '/app-release') return { version: '0.0.0', url: '' }
            return { items: [], total: 0, perPage: 60 }
          }
          if (command === 'fetch_json') {
            if (args.url.endsWith('/manifest.json')) return { id: 'fixture', name: 'Fixture', version: '1', types: ['movie'], resources: ['catalog', 'meta', 'stream', 'subtitles'], catalogs: [{ id: 'top', type: 'movie' }] }
            if (args.url.includes('/catalog/')) return { metas: [film] }
            if (args.url.includes('/meta/')) return { meta: film }
            if (args.url.includes('/subtitles/')) {
              if (fixture.delaySubtitles) { fixture.subtitleWaiting = true; await new Promise(resolve => { fixture.releaseSubtitles = resolve }) }
              return { subtitles: [] }
            }
            return { streams: [{ name: 'Fixture source', url: 'https://fixture.invalid/video.mp4' }] }
          }
          if (command === 'download_list') return { items: [] }
          if (command === 'plugin:event|listen') return 1
          return null
        },
      }
    })
    await page.goto(origin)
    await expect(page.getByRole('alert').filter({ hasText: 'Unable to restore local data.' })).toBeVisible()
    const before = await page.evaluate(() => ({ state: window.auditFixture.store.state, writes: window.auditFixture.writes.filter(key => ['state', 'session', 'plugins'].includes(key)) }))
    expect(before.writes).toEqual([])
    expect(JSON.parse(before.state).library[0].id).toBe('fixture')
    await page.evaluate(() => { window.auditFixture.failRead = false })
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.locator('.boot-screen')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => !!window.auditFixture.store.accountSync)).toBe(true)
    await expect(page.locator('.hero')).toContainText('Saved fixture')
    await page.locator('.hero').getByRole('button', { name: 'Discover', exact: true }).click()
    await page.getByRole('button', { name: 'Watch', exact: true }).click()
    const sourceDialog = page.getByRole('dialog', { name: 'Choose a source' })
    await expect(sourceDialog).toBeVisible()
    await page.evaluate(() => { window.auditFixture.delaySubtitles = true })
    await sourceDialog.locator('.source-play').first().click()
    await expect.poll(() => page.evaluate(() => window.auditFixture.subtitleWaiting)).toBe(true)
    await page.evaluate(() => {
      const fixture = window.auditFixture, second = fixture.remote.profiles.find(profile => profile.id === 'second')
      fixture.remote = { ...fixture.remote, ...second, activeProfileId: second.id, profiles: [second] }
      fixture.version++
      window.dispatchEvent(new Event('focus'))
    })
    await expect.poll(() => page.evaluate(() => JSON.parse(window.auditFixture.store.state).activeProfileId)).toBe('second')
    await expect(sourceDialog).toHaveCount(0)
    await page.evaluate(() => window.auditFixture.releaseSubtitles())
    await expect.poll(() => page.evaluate(() => document.querySelector('.source-loading') === null)).toBe(true)
    expect(await page.evaluate(() => window.auditFixture.commands.filter(command => command === 'play_media'))).toEqual([])
    expect(errors).toEqual([])
    await page.close()
  }

  const dialogPage = await browser.newPage()
  await dialogPage.goto(origin + '/tests/dialog-regression.html')
  const dialog = dialogPage.getByRole('dialog', { name: 'Saving settings' })
  await expect(dialog).toBeVisible()
  await dialogPage.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await dialogPage.getByRole('button', { name: 'Finish saving' }).click()
  await dialogPage.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(dialogPage.getByText('Closed', { exact: true })).toBeVisible()
  console.log('PASS: restoration failure/retry and playback profile race at 390/1440px; busy dialog Escape protection')
} finally {
  await browser.close()
}
