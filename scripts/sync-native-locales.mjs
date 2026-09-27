import { copyFile, mkdir, readdir } from 'node:fs/promises'
const source = new URL('../apps/client/src/locales/', import.meta.url)
for (const directory of [
  '../apps/client/src-tauri/gen/android/app/src/main/assets/locales/',
  '../apps/client/src-tauri/resources/windows/player/locales/',
]) {
  const target = new URL(directory, import.meta.url)
  await mkdir(target, { recursive: true })
  for (const name of await readdir(source)) {
    if (name.endsWith('.json')) await copyFile(new URL(name, source), new URL(name, target))
  }
}
