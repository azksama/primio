import { describe, expect, it } from 'vitest'
import type { PrimioPlugin } from '@primio/sdk'
import { createState, snapshotState, switchProfile } from './preferences'
import { storePlugins, upgradeStorePlugin } from './plugin-store'
import { defaultWatchOrder, importWatchCollection, watchCollectionId } from './watch-collections'
import { collectionKey } from './library-key'
import { sortCollection } from './collection-rules'

const starWars = storePlugins.find(p => p.id === 'primio.star-wars')!
describe('watch orders as profile collections', () => {
  it('imports all films in chronology, keeping the existing library and its progress intact', async () => {
    const state = createState(), order = defaultWatchOrder(starWars)!, id = await watchCollectionId(starWars)
    state.library = [{ id:'tt0076759', type:'movie', name:'Custom title', poster:'https://example.com/poster.jpg' }]
    state.progress = [{ ...state.library[0], videoId:'tt0076759', position:100, duration:200, updatedAt:1 }]
    const imported = importWatchCollection(state, starWars, order, id)
    expect(imported.library).toHaveLength(13)
    expect(imported.library[0]).toEqual(state.library[0])
    expect(imported.progress).toBe(state.progress)
    expect(imported.collections![0].name).toBe('Star Wars')
    expect(imported.collections![0].items).toEqual(order.entries.map(collectionKey))
    const sorted = sortCollection(imported.library, imported.collections![0].sortRules!, imported.library, [], imported.progress, imported.settings, imported.collections![0].items)
    expect(sorted.map(m => m.id)).toEqual(order.entries.map(m => m.id))
    const restored = snapshotState(imported)
    expect(restored.profiles[0].collections).toEqual(imported.collections)
  })
  it('updates the same collection explicitly without duplicates or recreating deleted collections on load', async () => {
    const id = await watchCollectionId(starWars), state = createState(), order = defaultWatchOrder(starWars)!
    const first = importWatchCollection(state, starWars, order, id)
    const second = importWatchCollection(first, starWars, starWars.watchOrder![1], id)
    expect(second.collections).toHaveLength(1)
    expect(second.library).toHaveLength(13)
    expect(second.collections![0].items).toEqual(starWars.watchOrder![1].entries.map(collectionKey))
    const deleted = { ...second, collections: [] }
    expect(snapshotState(deleted).collections).toEqual([])
  })
  it('keeps the imported collection and the accent isolated to the active profile', async () => {
    const state = createState()
    state.profiles.push({ ...state.profiles[0], id:'second', name:'Second', library:[], collections:[], settings:{ ...state.settings } })
    const first = importWatchCollection(state, starWars, defaultWatchOrder(starWars)!, await watchCollectionId(starWars))
    first.settings = { ...first.settings, oledAccent:'#22CCAA' }
    const second = switchProfile(first, 'second')
    expect(second.collections).toEqual([])
    expect(second.settings.oledAccent).toBeUndefined()
    expect(switchProfile(second, state.activeProfileId).collections).toHaveLength(1)
    expect(switchProfile(second, state.activeProfileId).settings.oledAccent).toBe('#22CCAA')
  })
  it('requires permission and enforces collection/library limits without modifying state', async () => {
    const id = await watchCollectionId(starWars), order = defaultWatchOrder(starWars)!, state = createState()
    expect(defaultWatchOrder({ ...starWars, permissions:[] })).toBeUndefined()
    expect(() => importWatchCollection(state, { ...starWars, permissions:[] }, order, id)).toThrow()
    state.collections = Array.from({length:50}, (_,i) => ({id:String(i),name:String(i),items:[]}))
    expect(() => importWatchCollection(state, starWars, order, id)).toThrow('50')
    expect(state.library).toHaveLength(0)
    state.collections = []
    state.library = Array.from({length:2000}, (_,i) => ({id:String(i),name:String(i),type:'movie'}))
    expect(() => importWatchCollection(state, starWars, order, id)).toThrow('2 000')
    expect(state.collections).toHaveLength(0)
    expect(id.length).toBeLessThanOrEqual(64)
    expect(await watchCollectionId({ ...starWars, name:'Renamed', version:'2.0.0' })).toBe(id)
  })
  it('collapses episode entries to titles, preserving the first position', () => {
    const state=createState(), plugin:PrimioPlugin={ ...starWars, watchOrder:[{id:'custom',title:'Custom',order:'custom',entries:[{id:'show',type:'series',name:'Show',videoId:'show:1:1'},{id:'movie',type:'movie',name:'Film'},{id:'show',type:'series',name:'Show',videoId:'show:1:2'}]}] }
    const result=importWatchCollection(state,plugin,plugin.watchOrder![0],'watch-custom')
    expect(result.library).toHaveLength(2)
    expect(result.collections![0].items).toEqual(['["series","show"]','["movie","movie"]'])
  })
  it('upgrades the official legacy film guide while preserving its enabled state', () => {
    expect(upgradeStorePlugin({ ...starWars, version:'1.0.0', enabled:false })).toEqual({ ...starWars, enabled:false })
    const custom = { ...starWars, author:'Other author', version:'1.0.0' }
    expect(upgradeStorePlugin(custom)).toBe(custom)
  })
})
