import { describe, it, expect } from 'vitest'
import { discoveryService } from './random-discovery'
import { saveTmdbToken, tmdbToken, validateTmdbToken } from './metadata-provider'
import { readSecure } from './platform'

describe('External random discovery', () => {
  it('uses the personal TMDB token, filters and canonical IDs without leaking it', async () => {
    const urls: URL[] = []
    const fetcher: typeof fetch = async (url, init) => {
      urls.push(new URL(String(url)))
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer private-test-token')
      return Response.json(String(url).includes('/discover/') ? {total_pages:1,results:[{id:1}]} : {id:1,imdb_id:'tt1',title:'Movie',runtime:105,vote_average:8.1,genres:[{id:878,name:'Science Fiction'}]})
    }
    const r = await discoveryService('private-test-token',fetcher,()=>0)({type:'movie',genre:'Science Fiction',from:1990,to:1999,rating:7.5,minutes:120,country:'JP'})
    expect(r.item?.id).toBe('tt1'); expect(r.item?.ratingSource).toBe('TMDB')
    expect(urls[0].searchParams.get('with_runtime.lte')).toBe('120')
    expect(urls[0].searchParams.get('with_origin_country')).toBe('JP')
    expect(urls[0].searchParams.get('with_genres')).toBe('878')
    expect(JSON.stringify(r)).not.toContain('private-test-token')
  })
  it('queries AniList publicly with inclusive duration/rating limits', async () => {
    const fetcher: typeof fetch = async (url, init) => {
      expect(url).toBe('https://graphql.anilist.co')
      expect(new Headers(init?.headers).get('Authorization')).toBeNull()
      const {variables}=JSON.parse(String(init?.body))
      expect(variables.genre).toEqual(['Sci-Fi']); expect(variables.score).toBe(74); expect(variables.duration).toBe(25)
      return Response.json({data:{Page:{pageInfo:{lastPage:1},media:[{id:10,idMal:20,format:'TV',title:{romaji:'Anime'},startDate:{year:2020},averageScore:80,genres:['Sci-Fi'],duration:24}]}}})
    }
    const r=await discoveryService('',fetcher,()=>0)({type:'anime',genre:'Science Fiction',rating:7.5,minutes:24})
    expect(r.item?.id).toBe('mal:20'); expect(r.item?.type).toBe('series'); expect(r.provider).toBe('AniList')
  })
  it.each(['JP','KR','CN'])('rejects exclusions and %s animation in the series category', async country => {
    const fetcher:typeof fetch=async(url)=>Response.json(String(url).includes('/discover/')?{total_pages:1,results:[{id:1},{id:2}]}:String(url).includes('/tv/1?')?{id:1,external_ids:{imdb_id:'tt1'},genres:[{id:16}],origin_country:[country]}:{id:2,external_ids:{imdb_id:'tt2'}})
    expect((await discoveryService('test',fetcher,()=>0)({type:'series',exclude:['tt2']})).item).toBeNull()
  })
  it('uses original-language variants when the animation origin is missing', async () => {
    const fetcher:typeof fetch=async(url)=>Response.json(String(url).includes('/discover/')?{total_pages:1,results:[{id:1}]}:{id:1,external_ids:{imdb_id:'tt1'},genres:[{id:16}],origin_country:[],original_language:'zh-Hans'})
    expect((await discoveryService('test',fetcher,()=>0)({type:'series'})).item).toBeNull()
  })
  it('explains missing/invalid credentials and upstream failures', async () => {
    await expect(discoveryService('')({type:'movie'})).rejects.toThrow('TMDB_NOT_CONFIGURED')
    await expect(discoveryService('bad',async()=>new Response('',{status:401}))({type:'movie'})).rejects.toThrow('TMDB_INVALID_TOKEN')
    await expect(discoveryService('',async()=>new Response('',{status:429}))({type:'anime'})).rejects.toThrow('PROVIDER_BUSY')
  })
  it('keeps Any useful with public anime when TMDB is not configured', async () => {
    const fetcher:typeof fetch=async(url)=>{ expect(url).toBe('https://graphql.anilist.co');return Response.json({data:{Page:{pageInfo:{lastPage:1},media:[]}}}) }
    expect((await discoveryService('',fetcher,()=>0)({})).provider).toBe('AniList')
  })
  it('caches successes per credential instance and retries failures', async () => {
    let calls=0
    const service=discoveryService('',async()=>{calls++;return calls===1?new Response('',{status:503}):Response.json({data:{Page:{pageInfo:{lastPage:1},media:[]}}})},()=>0)
    await expect(service({type:'anime'})).rejects.toThrow()
    await service({type:'anime'});await service({type:'anime'})
    expect(calls).toBe(2)
  })
  it('isolates personal credentials from account state and other users', async () => {
    await saveTmdbToken('first', 'private-first'); await saveTmdbToken('second', 'private-second')
    expect(await tmdbToken('first')).toBe('private-first')
    expect(await tmdbToken('second')).toBe('private-second')
    expect(await tmdbToken('local')).toBe('')
    expect(await readSecure('state')).toBeNull()
    await saveTmdbToken('first','')
    expect(await tmdbToken('first')).toBe(''); expect(await tmdbToken('second')).toBe('private-second')
    await saveTmdbToken('second','')
  })
  it('rejects malformed credentials before making a request', async () => {
    await expect(validateTmdbToken('invalid\nheader')).rejects.toThrow('TMDB_INVALID_TOKEN')
    await expect(validateTmdbToken('')).rejects.toThrow('TMDB_INVALID_TOKEN')
  })
})
