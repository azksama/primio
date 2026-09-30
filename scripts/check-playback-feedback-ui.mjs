import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { prepareDiscoveryFixtures } from './fixtures/discovery.mjs'
const require = createRequire(new URL('../apps/client/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const output = fileURLToPath(new URL('../.impeccable/review/playback-feedback/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [390, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 },
      hasTouch: width < 1100, userAgent: width < 1100 ? 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36' : undefined })
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await prepareDiscoveryFixtures(page)
    await page.addInitScript(() => {
      const invoke = window.__TAURI_INTERNALS__.invoke
      const now = Date.now()
      const meta = { id: 'feedback', type: 'series', name: 'QA Episode Feedback', category: 'anime',
        logo: '/qa-logo.svg', poster: '/avatars/07.jpg', description: 'A synthetic series for playback verification.', genres: ['Anime'],
        videos: Array.from({ length: 24 }, (_, index) => ({ id: `feedback:1:${index + 1}`, season: 1, episode: index + 1,
          title: 'A very long episode title that must stay on a single line even on a narrow phone ' + (index + 1),
          thumbnail: '/avatars/07.jpg', overview: 'A long episode synopsis that should be passed to the native player and remain inside a fixed row. '.repeat(6),
          released: new Date(now - 86400000).toISOString() })) }
      const progress = [{ id: meta.id, type: meta.type, name: meta.name, category: meta.category, poster: meta.poster,
        videoId: 'feedback:1:12', episode: 12, season: 1, position: 60, duration: 100, watched: false, updatedAt: now }]
      const state = { activeProfileId: 'main', library: [meta], progress, settings: { uiLanguage: 'en', reduceMotion: true },
        profiles: [{ id: 'main', name: 'QA', avatar: '01', color: '#FFFFFF', library: [meta], progress, settings: { uiLanguage: 'en', reduceMotion: true } }],
        addons: [{ url: 'https://qa.example/manifest.json', enabled: true }] }
      window.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
        if (command === 'secure_read' && args.key === 'state') return JSON.stringify(state)
        if (command === 'fetch_json' && args.url.includes('/meta/series/feedback.json')) return { meta }
        if (command === 'play_media') { window.__qaPlayback = args; return {} }
        if (command === 'fetch_json' && args.url.includes('filter[text]')) return { data: [] }
        return invoke(command, args)
      }
    })
    await page.route('**/qa-logo.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="170"><text x="250" y="115" text-anchor="middle" fill="white" font-size="60">QA Episodes</text></svg>' }))
    await page.goto(process.env.PRIMIO_UI_URL ?? 'http://127.0.0.1:9477', { waitUntil: 'domcontentloaded' })
    const resume = page.locator('.continue-card').filter({ hasText: 'QA Episode Feedback' })
    await expect(resume).toHaveCount(1)
    await expect(resume).toContainText('Episode 12')
    await page.screenshot({ path: `${output}/${width}-resume.png` })
    await resume.click()
    await page.locator('.source-play').first().click()
    await expect.poll(() => page.evaluate(() => window.__qaPlayback?.title)).toContain('Episode 12')
    const playback = await page.evaluate(() => ({ extra: JSON.parse(window.__qaPlayback.playerExtra), context: JSON.parse(window.__qaPlayback.progressContext), position: window.__qaPlayback.position }))
    expect(playback.extra.episodes).toHaveLength(24)
    expect(playback.extra.currentVideoId).toBe('feedback:1:12')
    expect(playback.extra.episodes[11]).toMatchObject({ current: true, thumbnail: '/avatars/07.jpg' })
    expect(playback.extra.episodes[11].description).toContain('inside a fixed row')
    expect(playback.context.meta.videos).toHaveLength(24)
    expect(playback.position).toBe(60)
    await page.getByRole('navigation').getByRole('button', { name: 'My list', exact: true }).click()
    await page.locator('.poster').filter({ hasText: 'QA Episode Feedback' }).click()
    await expect(page.locator('.episode-copy strong').first()).toBeVisible()
    const titles = await page.locator('.episode-copy strong').evaluateAll(nodes => nodes.map(node => ({
      height: node.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(node).lineHeight),
      whiteSpace: getComputedStyle(node).whiteSpace, ellipsis: getComputedStyle(node).textOverflow,
    })))
    expect(titles.every(title => title.whiteSpace === 'nowrap' && title.ellipsis === 'ellipsis' && title.height <= title.lineHeight + 1)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.locator('.episode-copy strong').nth(11).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/${width}-episode-titles.png` })
    expect(errors).toEqual([])
    results.push({ width, resumeHydrates24Episodes: true, synopsisPassed: true, positionPreserved: true, singleLineTitles: true, overflow: false, errors })
    await page.close()
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2) + '\n')
  console.log(JSON.stringify(results, null, 2))
} finally { await browser.close() }
