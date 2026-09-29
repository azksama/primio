import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { prepareDiscoveryFixtures } from './fixtures/discovery.mjs'
const require = createRequire(new URL('../apps/client/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const browser = await chromium.launch({ headless: true })
const output = new URL('../tmp/validation-neo-graphite/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
await mkdir(output, {recursive:true})
const results = []
try {
  for (const viewport of [{width:1440,height:900}, {width:390,height:844}, {width:1024,height:768}]) {
    const page = await browser.newPage({viewport,hasTouch:viewport.width<1100,
      userAgent:viewport.width<1100?'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36':undefined})
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await prepareDiscoveryFixtures(page)
    // Only this QA vault is persisted; no account or production credentials are used.
    await page.addInitScript(()=>{
      const invoke=window.__TAURI_INTERNALS__.invoke
      window.__TAURI_INTERNALS__.invoke=(cmd,args={})=>{
        if(cmd==='set_theme')window.__qaTheme=JSON.parse(args.theme)
        if(cmd==='secure_write')sessionStorage.setItem('qa-vault-'+args.key,args.value)
        if(cmd==='secure_read' && sessionStorage.getItem('qa-vault-'+args.key)!==null)return Promise.resolve(sessionStorage.getItem('qa-vault-'+args.key))
        return invoke(cmd,args)
      }
    })
    await page.route('**/qa-logo.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="500" height="170"><text x="250" y="115" text-anchor="middle" fill="white" font-family="Georgia" font-size="76">After the rain</text></svg>'}))
    await page.goto(process.argv[2] ?? 'http://127.0.0.1:9477')
    const nav=page.getByRole('navigation')
    const settings=()=>nav.getByRole('button',{name:'Settings',exact:true}).click()
    const plugins=async()=>{await settings();await page.getByRole('button',{name:/Plugins/}).first().click()}
    const entry=()=>page.locator('.store-entry').filter({has:page.getByRole('heading',{name:'Neo Graphite',exact:true})})
    const capture=async(name)=>{
      await page.evaluate(()=>document.fonts.ready)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No page overflow: '+name).toBe(true)
      await page.screenshot({path:`${output}/${viewport.width}-${name}.png`})
    }
    await expect(nav).toBeVisible()
    await plugins()
    await entry().getByRole('button',{name:'Install',exact:true}).click()
    await page.getByRole('dialog').getByRole('button',{name:'Authorize and install',exact:true}).click()
    await expect(page.locator('html')).toHaveAttribute('data-material','neumorphic')
    await expect(entry().getByRole('button',{name:'Enabled',exact:true})).toBeVisible()
    await expect(page.locator('.toast')).toBeHidden({timeout:10000})
    await page.getByRole('button',{name:'Themes',exact:true}).click()
    if(viewport.width<1100)expect(await page.evaluate(()=>window.__qaTheme?.material)).toBe('neumorphic')
    await capture('themes')
    await nav.getByRole('button',{name:'Home',exact:true}).click()
    await expect(page.locator('.continue-card').first()).toBeVisible()
    await capture('home')
    await nav.getByRole('button',{name:'Explore',exact:true}).click()
    await expect(page.locator('main:visible .poster').first()).toBeVisible()
    await capture('explore')
    await page.locator('.explorer-filters .choice > button').first().click()
    await expect(page.locator('.choice-options').first()).toBeVisible()
    await capture('filters')
    await page.locator('.explorer-filters .choice > button').first().click()
    await page.locator('main:visible .poster').first().click()
    await page.getByRole('button',{name:'Continue watching',exact:true}).click()
    await expect(page.locator('.sources .compact-source')).toHaveCount(6)
    const bounds=await page.getByRole('dialog').boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width+1)
    await capture('sources')
    await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()
    await settings()
    await capture('settings')
    await page.getByRole('button',{name:/Account and profiles/}).first().click()
    await capture('profiles')
    await settings()
    await page.getByRole('button',{name:/Player/}).first().click()
    await capture('player-settings')
    const input=page.locator('input,button').filter({visible:true}).first()
    await input.focus()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none')
    await page.reload()
    await expect(nav).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-material','neumorphic')
    await plugins()
    await entry().getByRole('button',{name:'Enabled',exact:true}).click()
    await expect(page.locator('html')).toHaveAttribute('data-material','glass')
    await entry().getByRole('button',{name:'Enable',exact:true}).click()
    await expect(page.locator('html')).toHaveAttribute('data-material','neumorphic')
    await entry().getByRole('button',{name:'Uninstall Neo Graphite',exact:true}).click()
    await expect(page.locator('html')).toHaveAttribute('data-material','glass')
    expect(errors).toEqual([])
    results.push({viewport,activation:true,persistence:true,disabledRestore:true,uninstallRestore:true,overflow:false,errors})
    await page.close()
  }
  await writeFile(output+'/results.json',JSON.stringify(results,null,2))
  console.log('PASS: Neo Graphite installation, native payload, navigation, keyboard focus, persistence, disable and uninstall at three viewports (mocked native bridge/providers).')
} finally {await browser.close()}
