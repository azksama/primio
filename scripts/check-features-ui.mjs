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
const now = Date.now()
const metas = Array.from({ length: 18 }, (_, i) => ({
  id: 'qa' + i,
  type: ['movie', 'series', 'anime'][i % 3],
  name: 'QA ' + ['Movie', 'Series', 'Anime'][i % 3] + ' ' + i,
  poster: '/avatars/' + String((i % 10) + 1).padStart(2, '0') + '.jpg',
  background: '/avatars/01.jpg',
  genres: ['Adventure'],
  imdbRating: '8.2',
  cast: ['QA Actor One', 'QA Actor Two'],
  director: ['QA Director'],
  description:
    i === 1
      ? 'Repeated provider synopsis with a sufficiently long unique paragraph.\n\n'.repeat(15)
      : Array.from({ length: 30 }, (_, n) => 'A long synopsis part ' + n + '. ').join(''),
  trailers: [{ source: 'abcdefghijk' }],
  videos:
    i % 3
      ? [
          {
            id: 'qa' + i + ':1:1',
            title: 'New episode',
            thumbnail:
              i === 1 ? '/missing-episode-image.jpg' : i === 2 ? undefined : '/avatars/07.jpg',
            season: 1,
            episode: 1,
            released: new Date(now - 1000).toISOString(),
          },
          {
            id: 'qa' + i + ':1:2',
            title: 'Next episode',
            overview: 'A future episode synopsis that is shown in its own dialog in portrait.',
            season: 1,
            episode: 2,
            released: new Date(now + 86400000).toISOString(),
          },
        ]
      : undefined,
}))
await page.addInitScript(
  ({ metas, now }) => {
    const settings = {
      uiLanguage: 'en',
      reduceMotion: true,
      contentColumns: 3,
      showPosterLabels: true,
      episodeNotifications: true,
      updateNotifications: true,
    }
    const progress = metas.slice(0, 12).map((m, i) => ({
      ...m,
      videoId: i % 3 ? m.id + ':1:1' : m.id,
      position: 30,
      duration: 600,
      updatedAt: now - i,
      watched: false,
    }))
    const library = metas.slice(0, 9)
    progress.push({
      ...metas[12],
      videoId: metas[12].id,
      position: 600,
      duration: 600,
      updatedAt: now,
      watched: true,
    })
    library.push(metas[12])
    const profile = {
      id: 'main',
      avatar: '01',
      name: 'QA',
      color: '#DAD4C5',
      settings,
      library,
      progress,
    }
    const state = {
      settings,
      library,
      progress,
      profiles: [profile, { ...profile, id: 'second', name: 'QA Two', avatar: '02' }],
      activeProfileId: 'main',
      addons: [
        { url: 'https://qa.example/manifest.json', enabled: true },
        { url: 'https://qb.example/manifest.json', enabled: true },
      ],
    }
    const store = {
      state: JSON.stringify(state),
      onboarding: 'done',
      startupProfile: JSON.stringify({ account: 'local', profileId: 'main' }),
      notifications: JSON.stringify({ 'local:main': { since: now - 2000, read: [] } }),
    }
    const manifest = {
      id: 'qa.catalog',
      name: 'QA Catalog',
      version: '1.0.0',
      types: ['movie', 'series', 'anime'],
      resources: ['catalog', 'meta', 'stream'],
      catalogs: ['movie', 'series', 'anime'].map((type) => ({
        type,
        id: type,
        name: type,
        extra: [{ name: 'search' }, { name: 'genre', options: ['Adventure'] }],
      })),
    }
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
    window.isTauri = true
    window.__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command, args = {}) => {
        if (command === 'secure_read') return store[args.key] ?? null
        if (command === 'secure_write') {
          store[args.key] = args.value
          return
        }
        if (command === 'fetch_json') {
          const url = new URL(args.url)
          if (url.hostname === 'kitsu.io')
            return {
              data: [
                {
                  id: '43806',
                  attributes: {
                    canonicalTitle: 'Chainsaw Man',
                    subtype: 'TV',
                    startDate: '2022-10-11',
                    posterImage: { large: '/avatars/03.jpg' },
                  },
                },
              ],
              links: {},
            }
          if (command === 'open_link') return null
          if (url.pathname.endsWith('manifest.json'))
            return { ...manifest, name: url.host === 'qa.example' ? 'QA Catalog' : 'QB Catalog' }
          if (url.pathname.includes('/catalog/')) {
            const type = url.pathname.split('/catalog/')[1].split('/')[0]
            return { metas: metas.filter((m) => m.type === type) }
          }
          if (url.pathname.includes('/meta/'))
            return { meta: metas.find((m) => url.pathname.endsWith('/' + m.id + '.json')) }
          return {
            streams: [
              { name: '1080p WEB-DL', title: '1.5 GB', url: 'https://media.example/one.mp4' },
              { name: '720p WEBRip', title: '850 MB', url: 'https://media.example/two.mp4' },
              { name: '4K BluRay', title: '8 GB', url: 'https://media.example/three.mp4' },
            ],
          }
        }
        if (command === 'api_request')
          return {
            version: '0.2.4',
            url: 'https://github.com/azksama/primio/releases/tag/v0.2.4-preview.1',
          }
        if (command === 'cast_discover') return []; if (command === 'tv_device') return false; if (command === 'crash_report') return ''; if (command === 'download_list') return { items: [] }
        if (command === 'notification_permission') return { enabled: true }
        if (command === 'notification_config') return
        if (command === 'plugin:deep-link|get_current') return null
        if (command === 'plugin:event|listen') return 1
        return null
      },
    }
  },
  { metas, now },
)

await page.clock.install()
await page.goto(process.argv[2] ?? 'http://127.0.0.1:1420')
const nav=page.getByRole('navigation')
await expect(nav).toBeVisible()
await expect(page.locator('.hero-pagination button')).toHaveCount(4)
await expect(page.locator('.hero')).toHaveAttribute('data-category','movie')
await page.clock.fastForward(15000)
await expect(page.locator('.hero')).toHaveAttribute('data-category','series')
await page.clock.fastForward(15000)
await expect(page.locator('.hero')).toHaveAttribute('data-category','anime')
await page.clock.fastForward(15000)
await expect(page.locator('.hero')).toHaveAttribute('data-category','movie')
await page.getByRole('button',{name:'Pause slideshow'}).click()
await page.clock.fastForward(30000)
await expect(page.locator('.hero')).toHaveAttribute('data-category','movie')
await page.clock.resume()

await nav.getByRole('button',{name:'My list',exact:true}).click()
await page.getByRole('button',{name:'Create collection',exact:true}).click()
await page.getByRole('dialog').getByRole('textbox').fill('Weekend')
await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(0)
await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click()
await expect(page.getByRole('button',{name:/Weekend/})).toHaveAttribute('aria-pressed','true')
await page.locator('.collections .chips button').first().click()
const first = page.locator('.selectable-poster').first()
const box = await first.boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await expect(first).toHaveAttribute('aria-pressed', 'true')
await page.mouse.up()
await page.locator('.selectable-poster').nth(1).click()
await expect(page.locator('.is-selected')).toHaveCount(2)
await page.screenshot({path:output+'/collection-selection-local.png'})
await page.getByRole('button', {name:'Add to collection',exact:true}).click()
await page.getByRole('dialog').getByRole('button',{name:/Weekend/}).click()
await page.getByRole('button',{name:/Weekend/}).click()
await expect(page.locator('.selectable-poster')).toHaveCount(2)
await page.screenshot({path:output+'/collection.png'})
await page.getByRole('button',{name:'Edit collection',exact:true}).click()
await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(0)
await page.getByRole('dialog').getByRole('button',{name:'Delete collection',exact:true}).click()
await expect(page.getByRole('button',{name:/Weekend/})).toHaveCount(0)
await nav.getByRole('button',{name:'Settings',exact:true}).click()
await page.getByRole('button',{name:/Connected services/}).click()
await expect(page.getByText('Sign in to sync your services.')).toBeVisible()
await nav.getByRole('button',{name:'Settings',exact:true}).click()
await page.getByRole('button',{name:/Diagnostic/}).click()
await expect(page.getByRole('button',{name:'Send report',exact:true})).toBeDisabled()
await page.screenshot({path:output+'/diagnostics.png'})
await page.addInitScript(() => {
  const original=window.__TAURI_INTERNALS__.invoke
  let serverState=JSON.parse(sessionStorage.getItem('importServer')??'null'), version=Number(sessionStorage.getItem('importVersion')??0), failure=true
  window.oauthCalls=[]
  window.importOffline=sessionStorage.getItem('importOffline')==='true'
  window.inspectImportSync=()=>({serverState,local:JSON.parse(sessionStorage.getItem('importState')??'null')})
  window.__TAURI_INTERNALS__.invoke=async(command,args={})=>{
    if(command==='secure_read'&&args.key==='state'&&sessionStorage.getItem('importState'))return sessionStorage.getItem('importState')
    if(command==='secure_write'&&args.key==='state')sessionStorage.setItem('importState',args.value)
    if(command==='secure_read'&&args.key==='startupProfile')return JSON.stringify({account:'qa@example.org',profileId:'main'})
    if(command==='secure_read'&&args.key==='session')return JSON.stringify({token:'qa-token',email:'qa@example.org',version:0})
    if(command==='api_request'){
      if(args.path==='/account/progress')return {profiles:serverState?.profiles??[]}
      if(args.path==='/account/sync'){
        if(window.importOffline)throw {status:503,message:'Offline test'}
        if(args.method==='PUT'){serverState=args.body.state;version++;sessionStorage.setItem('importServer',JSON.stringify(serverState));sessionStorage.setItem('importVersion',String(version));window.oauthCalls.push('sync');return {version}}
        return {version,state:serverState}
      }
      if(args.path==='/account/integrations'){
        if(args.method==='GET')return {connections:[],providers:['trakt','anilist','mal'].map(provider=>({provider,configured:true}))}
        window.oauthCalls.push(args.body.provider)
        if(failure){failure=false;throw {message:'Connection test error',status:503}}
        return {url:'https://provider.example/authorize/'+args.body.provider}
      }
    }
    if(command==='provider_request'){
      if(args.operation==='stremioLogin')return {result:{authKey:'temporary-stremio-token'}}
      if(args.operation==='stremioLibrary')return {result:[{_id:'ttimported',type:'movie',name:'Imported Stremio movie'}]}
      if(args.operation==='stremioAddons')return {result:{addons:[{transportUrl:'https://import.example/manifest.json'},{transportUrl:'https://excluded.example/manifest.json'}]}}
    }
    if(command==='open_link'){window.oauthCalls.push(args.url);return}
    return original(command,args)
  }
})
await page.reload()
await nav.getByRole('button',{name:'Settings',exact:true}).click()
await page.getByRole('button',{name:/Connected services/}).click()
await page.getByRole('button',{name:'Connect',exact:true}).first().click()
await expect(page.getByRole('alert')).toContainText('Connection test error')
await page.getByRole('button',{name:'Connect',exact:true}).first().click()
await expect.poll(()=>page.evaluate(()=>window.oauthCalls.includes('https://provider.example/authorize/trakt'))).toBe(true)
expect(await page.evaluate(()=>window.oauthCalls.slice(0,2))).toEqual(['sync','trakt'])
await nav.getByRole('button',{name:'Settings',exact:true}).click()
await page.getByRole('button',{name:/Import a library/}).click()
const imports=page.getByRole('dialog')
await imports.locator('input[name="user"]').fill('stremio@example.org')
await imports.locator('input[name="password"]').fill('temporary-password')
await imports.getByRole('button',{name:'Preview import',exact:true}).click()
await expect(imports.getByText('Imported Stremio movie')).toBeVisible()
await imports.locator('.import-addon').filter({hasText:'excluded.example'}).locator('input').uncheck()
await page.evaluate(()=>{window.importOffline=true;sessionStorage.setItem('importOffline','true')})
await imports.getByRole('button',{name:'Import',exact:true}).click()
await expect.poll(()=>page.evaluate(()=>window.inspectImportSync().local?.pendingImports?.length)).toBe(1)
expect(await page.evaluate(()=>JSON.stringify(window.inspectImportSync().local))).not.toContain('temporary-password')
expect(await page.evaluate(()=>JSON.stringify(window.inspectImportSync().local))).not.toContain('temporary-stremio-token')
await page.reload()
await nav.getByRole('button',{name:'My list',exact:true}).click()
await expect(page.getByText('Import saved. Waiting to sync.')).toBeVisible()
await page.evaluate(()=>{window.importOffline=false;sessionStorage.removeItem('importOffline');window.dispatchEvent(new Event('online'))})
await expect.poll(()=>page.evaluate(()=>window.inspectImportSync().serverState?.library.some(item=>item.id==='ttimported'))).toBe(true)
await expect.poll(()=>page.evaluate(()=>window.inspectImportSync().local?.pendingImports?.length)).toBe(0)
const importedServer=await page.evaluate(()=>window.inspectImportSync().serverState)
expect(importedServer.addons.some(addon=>addon.url==='https://import.example/manifest.json')).toBe(true)
expect(importedServer.addons.some(addon=>addon.url==='https://excluded.example/manifest.json')).toBe(false)
expect(importedServer.profiles[0].library.some(item=>item.id==='ttimported')).toBe(true)
expect(importedServer.pendingImports).toBeUndefined()
expect(errors).toEqual([])
console.log('Collections, services, diagnostics and automatic Stremio import synchronization after offline restart passed with mock bridge.')

// Imported fonts persist locally, render in the preview, and can be removed.
await nav.getByRole('button',{name:'Settings',exact:true}).click()
await page.getByRole('button',{name:/^Player Playback/}).click()
const fontFile='apps/client/src-tauri/resources/windows/player/fonts/inter.ttf'
await page.getByLabel('Import a font',{exact:true}).setInputFiles(fontFile)
await expect(page.getByRole('button',{name:'Font',exact:true})).toContainText('Inter')
await expect.poll(()=>page.locator('.subtitle-preview > span').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('primio-')
await page.reload()
await nav.getByRole('button',{name:'Settings',exact:true}).click()
await page.getByRole('button',{name:/^Player Playback/}).click()
await expect(page.getByRole('button',{name:'Font',exact:true})).toContainText('Inter')
await page.screenshot({path:output+'/phone-imported-font.png'})
await page.getByRole('button',{name:'Delete imported font'}).click()
await expect(page.getByRole('button',{name:'Delete imported font'})).toHaveCount(0)
await page.getByLabel('Import a font',{exact:true}).setInputFiles({name:'invalid.ttf',mimeType:'font/ttf',buffer:Buffer.from('invalid font')})
await expect(page.getByRole('alert')).toContainText('Invalid font')
for(const desktop of [false,true]) {
  await page.setViewportSize({width:desktop?1280:390,height:desktop?850:844})
  await page.evaluate(desktop=>document.documentElement.classList.toggle('desktop',desktop),desktop)
  for(const target of ['Addons','Plugins']) {
    await nav.getByRole('button',{name:'Settings',exact:true}).click()
    await page.getByRole('button',{name:new RegExp('^'+target+' ')}).click()
    const title=await page.locator('.management-heading h1').boundingBox()
    const action=await page.locator('.management-action').boundingBox()
    if(desktop)expect(action.x).toBeGreaterThan(title.x+title.width)
    else expect(action.y).toBeGreaterThan(title.y+title.height)
    expect(action.y+action.height).toBeLessThan(250)
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:output+'/'+(desktop?'desktop':'phone')+'-'+target.toLowerCase()+'.png'})
  }
  if(desktop){
    const active=await nav.locator('button.active').boundingBox()
    expect(active.width).toBeLessThan(135);expect(active.height).toBeLessThanOrEqual(58)
  }
}
expect(errors).toEqual([])
console.log('Imported fonts, persistence, removal, invalid files, responsive management actions and compact desktop navigation passed.')

await browser.close()
