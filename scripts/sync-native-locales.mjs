import { copyFile, mkdir, readdir } from 'node:fs/promises'
const source = new URL('../apps/client/src/locales/', import.meta.url)
const target = new URL(
  '../apps/client/src-tauri/gen/android/app/src/main/assets/locales/',
  import.meta.url,
)
await mkdir(target, { recursive: true })
for (const name of await readdir(source)) {
  if (name.endsWith('.json')) await copyFile(new URL(name, source), new URL(name, target))
}
