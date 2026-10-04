import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DialogShell } from '../src/dialog-shell'

function Fixture() {
  const [busy, setBusy] = useState(true)
  const [open, setOpen] = useState(true)
  return open ? <DialogShell title="Saving settings" onClose={() => { if (!busy) setOpen(false) }}>
    <p>{busy ? 'Saving' : 'Saved'}</p>
    <button onClick={() => setBusy(false)}>Finish saving</button>
  </DialogShell> : <p>Closed</p>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
