import { invoke, isTauri } from '@tauri-apps/api/core'
import { bundledFonts, bundledFontId } from './bundled-fonts'

export interface SubtitleFont {
  id: string
  family: string
  data: ArrayBuffer
}
const selectionKey = 'primio.subtitle-font'
const interfaceSelectionKey = 'primio.interface-font'
const changed = 'primio-fonts-changed'
export const fontsChanged = changed

// libass selects the font's internal family, not its filename.
export function fontFamily(data: ArrayBuffer): string {
  const view = new DataView(data)
  if (
    data.byteLength < 12 ||
    data.byteLength > 5_000_000 ||
    ![0x00010000, 0x4f54544f].includes(view.getUint32(0))
  )
    throw Error('TTF/OTF · 5 MB maximum')
  const count = view.getUint16(4)
  if (12 + count * 16 > data.byteLength) throw Error('Invalid font')
  for (let i = 0; i < count; i++) {
    const entry = 12 + i * 16
    if (view.getUint32(entry) !== 0x6e616d65) continue
    const offset = view.getUint32(entry + 8),
      length = view.getUint32(entry + 12)
    if (offset + length > data.byteLength || length < 6) break
    const records = view.getUint16(offset + 2),
      strings = offset + view.getUint16(offset + 4)
    if (6 + records * 12 > length) break
    const names: { value: string; rank: number }[] = []
    for (let j = 0; j < records; j++) {
      const p = offset + 6 + j * 12,
        platform = view.getUint16(p),
        lang = view.getUint16(p + 4),
        name = view.getUint16(p + 6)
      if (![1, 16].includes(name) || ![0, 3].includes(platform)) continue
      const size = view.getUint16(p + 8),
        start = strings + view.getUint16(p + 10)
      if (!size || size % 2 || start < offset || start + size > offset + length) continue
      const value = new TextDecoder('utf-16be').decode(data.slice(start, start + size)).trim()
      if (value && value.length <= 100 && !/[\u0000-\u001f]/.test(value))
        names.push({ value, rank: (name === 16 ? 2 : 0) + (lang === 0x409 ? 1 : 0) })
    }
    if (names.length) return names.sort((a, b) => b.rank - a.rank)[0].value
  }
  throw Error('Invalid font family')
}

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('primio-fonts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('fonts', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('fonts', mode),
        request = run(tx.objectStore('fonts'))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = tx.onabort = () => reject(tx.error || request.error)
    })
  } finally {
    db.close()
  }
}
export const listFonts = () => transaction<SubtitleFont[]>('readonly', (store) => store.getAll())
export const selectedFontId = () => localStorage.getItem(selectionKey) || ''
export const selectedInterfaceFontId = () => localStorage.getItem(interfaceSelectionKey) || ''
export function selectInterfaceFont(id: string) {
  id
    ? localStorage.setItem(interfaceSelectionKey, id)
    : localStorage.removeItem(interfaceSelectionKey)
  window.dispatchEvent(new Event(changed))
}
export function selectFont(id: string) {
  id ? localStorage.setItem(selectionKey, id) : localStorage.removeItem(selectionKey)
  window.dispatchEvent(new Event(changed))
}
const faces = new Map<string, FontFace>()
export async function loadFont(font: SubtitleFont) {
  if (!faces.has(font.id)) {
    const face = await new FontFace('primio-' + font.id, font.data).load()
    document.fonts.add(face)
    faces.set(font.id, face)
  }
  return 'primio-' + font.id
}
export async function importFont(file: File, target: 'subtitle' | 'interface' = 'subtitle') {
  if (!/\.(ttf|otf)$/i.test(file.name) || file.size > 5_000_000)
    throw Error('TTF/OTF · 5 MB maximum')
  const data = await file.arrayBuffer(),
    family = fontFamily(data)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const id = [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join('')
  const fonts = await listFonts()
  if (fonts.length >= 10 && !fonts.some((f) => f.id === id)) throw Error('10 fonts maximum')
  const font = { id, family, data }
  await loadFont(font)
  await transaction('readwrite', (store) => store.put(font))
  target === 'interface' ? selectInterfaceFont(id) : selectFont(id)
  return font
}
export async function removeFont(id: string) {
  if (isTauri()) await invoke('remove_subtitle_font', { id })
  await transaction('readwrite', (store) => store.delete(id))
  const face = faces.get(id)
  if (face) document.fonts.delete(face)
  faces.delete(id)
  if (selectedInterfaceFontId() === id) localStorage.removeItem(interfaceSelectionKey)
  if (selectedFontId() === id) selectFont('')
  else window.dispatchEvent(new Event(changed))
}
export async function customFontOptions(defaultFont?: string) {
  const id = selectedFontId()
  let font = id ? (await listFonts()).find((f) => f.id === id) : undefined
  if (!font && defaultFont) {
    const bundled = bundledFonts.find((f) => f.id === bundledFontId(defaultFont))!
    const response = await fetch(bundled.url)
    if (!response.ok) throw Error('Bundled font unavailable')
    const data = await response.arrayBuffer()
    const hash = await crypto.subtle.digest('SHA-256', data)
    font = {
      id: [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join(''),
      family: fontFamily(data),
      data,
    }
  }
  if (!font) return {}
  const native = isTauri()
    ? await invoke<{ path: string; directory: string }>('prepare_subtitle_font', {
        id: font.id,
        data: [...new Uint8Array(font.data)],
      })
    : {}
  return { subtitleFont: 'custom', customFont: { family: font.family, ...native } }
}
