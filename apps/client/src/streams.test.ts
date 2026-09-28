import { afterEach, expect, it, vi } from 'vitest'
import { streams, type StreamResults } from './addons'
import type { Addon } from './types'
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }))
afterEach(() => vi.unstubAllGlobals())
const addon = (name: string): Addon => ({url: `https://${name}.example/manifest.json`, enabled: true,
 manifest: {id:name, name, version:'1', types:['movie'], resources:['stream']}})

it('publishes early results and keeps configured priority when a slower provider arrives', async () => {
 const resolvers: ((r:Response)=>void)[] = []
 vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => resolvers.push(resolve))))
 const updates: StreamResults[]=[]
 const done=streams([addon('first'),addon('second')], 'movie', 'tt1', r=>updates.push(r))
 expect(updates[0].pending).toBe(2)
 resolvers[1](Response.json({streams:[{url:'https://video.example/second',title:'B'}]}))
 await vi.waitFor(()=>expect(updates.at(-1)?.items).toHaveLength(1))
 const early=updates.at(-1)!
 expect(early.pending).toBe(1)
 expect(early.items[0].addonName).toBe('second')
 resolvers[0](Response.json({streams:[{url:'https://video.example/first',title:'A'}]}))
 const final=await done
 expect(final.items.map(i=>i.addonName)).toEqual(['first','second'])
 expect(final.items[1].sourceKey).toBe(early.items[0].sourceKey)
 expect(early.groups[0].pending).toBe(true)
 expect(final.pending).toBe(0)
})
it('retains usable sources when another provider fails or returns malformed data',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('first')?new Response('',{status:503}):Response.json({streams:[null,{url:'https://v.example/a'}]})))
 const final=await streams([addon('first'),addon('second'),{...addon('disabled'),enabled:false}], 'movie','tt1')
 expect(final.failed).toBe(1);expect(final.providers).toBe(2);expect(final.pending).toBe(0)
 expect(final.items).toHaveLength(1)
})
