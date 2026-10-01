import { describe, it, expect } from 'vitest'
import { parseMarketplaceEntry } from './marketplace'
import { parseDeepLink } from './deeplinks'

const manifest = { schemaVersion: 2, id: 'community.theme', name: 'A theme', description: 'Theme for testing', author: 'Community', version: '1.0.0', category: 'theme', permissions: ['theme'], theme: { background: '#101010' } }
describe('Marketplace trust boundaries', () => {
  it('requires a published, valid declarative manifest and boolean trust labels', () => {
    expect(parseMarketplaceEntry({ manifest, status: 'pending', official: true })).toBeNull()
    expect(parseMarketplaceEntry({ manifest: { ...manifest, script: 'run()' }, status: 'published' })).toBeNull()
    expect(parseMarketplaceEntry({ manifest, status: 'published', official: 'true', verified: true, featured: 1 })).toMatchObject({ official: false, verified: true, featured: false })
  })
  it('accepts plugin identifiers without turning links into arbitrary network requests', () => {
    expect(parseDeepLink('primio://plugin/community.theme')).toEqual({ kind: 'plugin', id: 'community.theme' })
    for (const value of ['primio://plugin/../account', 'primio://plugin/abc?token=private', 'primio://plugin/a%2Fb', 'primio://plugin/https://evil.test']) expect(() => parseDeepLink(value)).toThrow()
  })
})
