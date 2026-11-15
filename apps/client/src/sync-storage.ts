import { writeSecure } from './platform'
import { snapshotState } from './preferences'
import type { UserState } from './types'

// The merge baseline must never get ahead of the durable local snapshot.
// After interruption between these writes, the older baseline can safely
// reconcile the newer local state; the reverse can resurrect stale deletions.
export async function persistAccountSync(
  account: string,
  local: UserState,
  baseline: UserState,
  active: () => boolean,
  write = writeSecure,
) {
  if (!active()) return false
  await write('state', JSON.stringify(snapshotState(local)))
  if (!active()) return false
  await write('accountSync', JSON.stringify({ account, state: baseline }))
  return active()
}
