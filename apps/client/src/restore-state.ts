import { pluginSchema } from '@primio/sdk'
import { readSecure } from './platform'
import { normalizeState } from './preferences'
import { upgradeStorePlugin } from './plugin-store'

// Read and parse the complete snapshot before enabling persistence. A failed
// read must never replace the user's stored library with initial empty state.
export async function restoreLocalState(read = readSecure) {
  const [saved, session, installed, onboarded] = await Promise.all(
    ['state', 'session', 'plugins', 'onboarding'].map(key => read(key)),
  )
  const state = saved ? normalizeState(JSON.parse(saved)) : undefined
  const parsedSession = session ? JSON.parse(session) : {}
  if (!parsedSession || typeof parsedSession !== 'object' || Array.isArray(parsedSession) ||
      parsedSession.token !== undefined && typeof parsedSession.token !== 'string' ||
      parsedSession.email !== undefined && typeof parsedSession.email !== 'string')
    throw Error('Invalid local session')
  const plugins = installed ? JSON.parse(installed) : []
  if (!Array.isArray(plugins)) throw Error('Invalid local plugins')
  return {
    state,
    session: {
      token: parsedSession.token ?? '',
      email: parsedSession.email ?? '',
      version: Number.isSafeInteger(parsedSession.version) && parsedSession.version >= 0 ? parsedSession.version : 0,
    },
    plugins: plugins.map(plugin => upgradeStorePlugin(pluginSchema.parse(plugin))),
    onboarding: onboarded !== 'done',
  }
}
