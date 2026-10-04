import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Profiles } from '../src/components'
import { PinSettings, useProfilePin } from '../src/profile-pin'
import { createState, switchProfile } from '../src/preferences'
import { setLocale } from '../src/i18n'
import { UniversalSearch } from '../src/discovery-panel'

setLocale('fr')
const fixture = (window as any).profileFixture
const searchTitles = ['movie', 'series'].map(type => ({ id: 'fixture-' + type, type, name: 'Fixture ' + type }))
function initialState() {
  const state = createState(), first = { ...state.profiles[0], id: 'first', name: 'First' }
  return { ...state, activeProfileId: first.id, profiles: [first, { ...first, id: 'second', name: 'Second', avatar: '02' }] }
}
function Fixture() {
  const [account, setAccount] = useState('one'), [state, setState] = useState(initialState)
  const [category, setCategory] = useState('all')
  const profile = state.profiles.find(p => p.id === state.activeProfileId)!
  const pins = useProfilePin(account)
  const protectedProfile = { ...profile, pin: { salt: '00'.repeat(16), hash: '00'.repeat(32) } }
  fixture.state = state
  return <>
    <button onClick={() => setState(s => switchProfile(s, 'second'))}>Change profile</button>
    <button onClick={() => { setAccount('two'); setState(initialState()) }}>Change account</button>
    <button onClick={() => setState(s => ({ ...s, profiles: s.profiles.filter(p => p.id === s.activeProfileId) }))}>Keep current profile only</button>
    <button onClick={() => void pins.unlock(protectedProfile).then(allowed => fixture.unlocks.push({ account, allowed }))}>Unlock protected profile</button>
    <PinSettings key={account + ':' + profile.id} profile={profile} unlock={async () => true}
      onChange={pin => { fixture.changes.push({ account, id: profile.id, pin }); setState(s => ({ ...s, profiles: s.profiles.map(p => p.id === profile.id ? { ...p, pin } : p) })) }} />
    <Profiles key={account} state={state} setState={setState} connected={false} authorize={async () => true}
      onSync={() => {}} onError={error => fixture.errors.push(String(error))}
      beforeRemove={async () => { fixture.removePending = true; await new Promise<void>(resolve => { fixture.releaseRemove = resolve }) }} />
    {pins.dialog}
    <button onClick={() => setCategory('series')}>Choose series explicitly</button>
    <UniversalSearch query="films Fixture" addons={[]} library={searchTitles} filters={{ type: category }}
      renderItem={meta => <p key={meta.id}>{meta.name}</p>} />
  </>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
