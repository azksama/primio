import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
const source = new URL('../apps/client/src/locales/', import.meta.url)
for (const directory of [
  '../apps/client/src-tauri/gen/android/app/src/main/assets/locales/',
  '../apps/client/src-tauri/resources/windows/player/locales/',
]) {
  const target = new URL(directory, import.meta.url)
  await mkdir(target, { recursive: true })
  for (const name of await readdir(source)) {
    if (!name.endsWith('.json')) continue
    const bytes = await readFile(new URL(name, source)), destination = new URL(name, target)
    const previous = await readFile(destination).catch(error => {
      if (error.code !== 'ENOENT') throw error
      return null
    })
    if (!previous?.equals(bytes)) await writeFile(destination, bytes)
  }
}
