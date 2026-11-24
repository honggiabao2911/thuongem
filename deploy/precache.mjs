import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, relative } from 'node:path'

const root = resolve(process.argv[2] ?? 'dist')
const base = process.argv[3] ?? '/'
const worker = resolve(root, 'sw.js')
const manifestFile = resolve(root, 'manifest.webmanifest')

if (base !== '/') {
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  for (const key of ['id', 'start_url', 'scope']) manifest[key] = base
  for (const icon of manifest.icons) icon.src = base + icon.src.slice(1)
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
}

const files = (await readdir(root, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name !== 'sw.js')
  .map(entry => relative(root, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort()
const source = await readFile(worker, 'utf8')
const hash = createHash('sha256').update(base).update(source)
for (const file of files) hash.update(await readFile(resolve(root, file)))
await writeFile(worker, source
  .replace("'thuong-em-dev'", JSON.stringify('thuong-em-' + hash.digest('hex').slice(0, 16)))
  .replace("const BASE = '/'", 'const BASE = ' + JSON.stringify(base))
  .replace("['/']", JSON.stringify([base, ...files.map(file => base + file)])))
