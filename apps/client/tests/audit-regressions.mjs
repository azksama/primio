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
          if (command === 'cast_discover') return [{ id: 'fixture-tv', name: 'Fixture TV' }]
          if (command === 'cast_control') return { position: 30, duration: 1000, connected: true }
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

    await page.locator('.bottom-nav').getByRole('button', { name: 'My list', exact: true }).click()
    await page.getByRole('button', { name: 'Create collection', exact: true }).click()
    const collectionDialog = page.locator('.collection-dialog')
    await collectionDialog.locator('input').first().fill('Old profile draft')
    async function remoteProfile(id) {
      await page.evaluate(id => {
        const fixture = window.auditFixture, previous = fixture.remote.profiles[0]
        const profile = { ...previous, id, name: id, progress: [], collections: [] }
        fixture.remote = { ...fixture.remote, ...profile, activeProfileId: id, profiles: [profile] }
        fixture.version++
        window.dispatchEvent(new Event('focus'))
      }, id)
      await expect.poll(() => page.evaluate(() => JSON.parse(window.auditFixture.store.state).activeProfileId)).toBe(id)
    }
    await remoteProfile('third')
    await expect(collectionDialog).toHaveCount(0)
    expect(await page.evaluate(() => JSON.parse(window.auditFixture.store.state).collections ?? [])).toEqual([])

    await page.locator('.bottom-nav').getByRole('button', { name: 'Home', exact: true }).click()
    await page.locator('.hero').getByRole('button', { name: 'Discover', exact: true }).click()
    await page.getByRole('button', { name: 'Watch', exact: true }).click()
    await sourceDialog.locator('.source-cast').first().click()
    const castDialog = page.getByRole('dialog', { name: 'Cast to a TV', exact: true })
    await page.getByRole('button', { name: 'Fixture TV', exact: true }).click()
    await expect(castDialog).toBeVisible()
    await remoteProfile('fourth')
    await expect(castDialog).toHaveCount(0)
    expect(await page.evaluate(() => JSON.parse(window.auditFixture.store.state).progress)).toEqual([])
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

  async function profilePage() {
    const page = await browser.newPage()
    await page.addInitScript(() => {
      const fixture = window.profileFixture = { changes: [], unlocks: [], errors: [], hashPending: false, writePending: false }
      window.isTauri = true
      window.__TAURI_INTERNALS__ = { async invoke(command) {
        if (command === 'secure_read') return null
        if (command === 'secure_write') {
          fixture.writePending = true
          await new Promise(resolve => { fixture.releaseWrite = resolve })
        }
      } }
      Object.defineProperty(crypto.subtle, 'deriveBits', { value: async () => {
        fixture.hashPending = true
        await new Promise(resolve => { fixture.releaseHash = resolve })
        return new Uint8Array(32).buffer
      } })
    })
    await page.goto(origin + '/tests/profile-regression.html')
    return page
  }
  async function release(page, operation) {
    await page.evaluate(async operation => {
      window.profileFixture[operation]()
      // All mocked continuations run as microtasks before the next rendered frame.
      await new Promise(requestAnimationFrame)
    }, operation)
  }
  for (const action of ['Change profile', 'Change account', 'Annuler', 'save']) {
    const page = await profilePage()
    await page.getByRole('button', { name: 'Protéger ce profil par un PIN', exact: true }).click()
    await page.getByLabel('Nouveau PIN (4 à 8 chiffres)', { exact: true }).fill('1234')
    await page.getByLabel('Confirmer le PIN', { exact: true }).fill('1234')
    await page.locator('.pin-settings').getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.profileFixture.hashPending)).toBe(true)
    if (action !== 'save') await page.getByRole('button', { name: action, exact: true }).click()
    await release(page, 'releaseHash')
    const changes = await page.evaluate(() => window.profileFixture.changes)
    if (action === 'save') expect(changes).toEqual([{ account: 'one', id: 'first', pin: expect.any(Object) }])
    else expect(changes).toEqual([])
    await page.close()
  }
  {
    const page = await profilePage()
    await page.getByRole('button', { name: 'Unlock protected profile', exact: true }).click()
    await page.getByRole('dialog', { name: 'PIN du profil', exact: true }).locator('input').fill('1234')
    await page.getByRole('button', { name: 'Déverrouiller', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.profileFixture.hashPending)).toBe(true)
    await release(page, 'releaseHash')
    await expect.poll(() => page.evaluate(() => window.profileFixture.writePending)).toBe(true)
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Change account').click())
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Unlock protected profile', exact: true }).click()
    await release(page, 'releaseWrite')
    await expect(page.getByRole('dialog', { name: 'PIN du profil', exact: true })).toBeVisible()
    expect(await page.evaluate(() => window.profileFixture.unlocks)).toEqual([{ account: 'one', allowed: false }])
    await page.close()
  }
  for (const action of ['Keep current profile only', 'Change account', 'remove']) {
    const page = await profilePage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.getByRole('button', { name: 'Supprimer First', exact: true }).click()
    await page.getByRole('button', { name: 'Supprimer le profil', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.profileFixture.removePending)).toBe(true)
    if (action !== 'remove') await page.getByRole('button', { name: action, exact: true }).click()
    await release(page, 'releaseRemove')
    expect(await page.evaluate(() => window.profileFixture.state.profiles.map(profile => profile.id)))
      .toEqual(action === 'Keep current profile only' ? ['first'] : action === 'Change account' ? ['first', 'second'] : ['second'])
    expect(errors).toEqual([])
    expect(await page.evaluate(() => window.profileFixture.errors)).toEqual([])
    await page.close()
  }
  {
    const page = await profilePage()
    await expect(page.locator('.search-section')).toHaveCount(1)
    await expect(page.locator('.search-section')).toContainText('Fixture movie')
    await page.getByRole('button', { name: 'Choose series explicitly', exact: true }).click()
    await expect(page.locator('.search-section')).toHaveCount(1)
    await expect(page.locator('.search-section')).toContainText('Fixture series')
    await page.close()
  }
  console.log('PASS: restoration/retry, playback/collection/cast scope at 390/1440px; dialog Escape; PIN/profile/account/cancellation and deletion races; natural search type')
} finally {
  await browser.close()
}
