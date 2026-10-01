import { readFile, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

// An entry's budget covers everything it loads up front: its own file plus the
// shared chunks it statically imports (with two pages — index.html and ipad.html —
// Rollup moves the code they share, such as React and Firebase, into such a chunk).
const budgets = {
  entryBytes: 900_000,
  entryGzipBytes: 260_000,
  asyncBytes: 250_000,
  asyncGzipBytes: 80_000,
}

const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'))
const sizes = new Map()
const sizeOf = async (file) => {
  if (!sizes.has(file)) {
    const path = `dist/${file}`
    sizes.set(file, { rawBytes: (await stat(path)).size, gzipBytes: gzipSync(await readFile(path)).length })
  }
  return sizes.get(file)
}

const staticFilesOf = (key, seen = new Set()) => {
  if (seen.has(key) || !manifest[key]) return seen
  seen.add(key)
  ;(manifest[key].imports || []).forEach((imported) => staticFilesOf(imported, seen))
  return seen
}

const failures = []
const loadedUpFront = new Set()

for (const [key, chunk] of Object.entries(manifest)) {
  if (!chunk.isEntry) continue
  const files = [...staticFilesOf(key)].map((chunkKey) => manifest[chunkKey].file).filter((file) => file.endsWith('.js'))
  let rawBytes = 0
  let gzipBytes = 0
  for (const file of files) {
    loadedUpFront.add(file)
    const size = await sizeOf(file)
    rawBytes += size.rawBytes
    gzipBytes += size.gzipBytes
  }
  console.log(`entry ${chunk.file} (+${files.length - 1} shared): ${(rawBytes / 1024).toFixed(1)} KB raw, ${(gzipBytes / 1024).toFixed(1)} KB gzip`)
  if (rawBytes > budgets.entryBytes) failures.push(`${chunk.file} loads ${rawBytes} bytes up front; budget is ${budgets.entryBytes}`)
  if (gzipBytes > budgets.entryGzipBytes) failures.push(`${chunk.file} loads ${gzipBytes} bytes gzipped up front; budget is ${budgets.entryGzipBytes}`)
}

const asyncFiles = [...new Set(Object.values(manifest).map((chunk) => chunk.file))]
  .filter((file) => file.endsWith('.js') && !loadedUpFront.has(file))

for (const file of asyncFiles) {
  const { rawBytes, gzipBytes } = await sizeOf(file)
  console.log(`async ${file}: ${(rawBytes / 1024).toFixed(1)} KB raw, ${(gzipBytes / 1024).toFixed(1)} KB gzip`)
  if (rawBytes > budgets.asyncBytes) failures.push(`${file} is ${rawBytes} bytes; budget is ${budgets.asyncBytes}`)
  if (gzipBytes > budgets.asyncGzipBytes) failures.push(`${file} is ${gzipBytes} bytes gzipped; budget is ${budgets.asyncGzipBytes}`)
}

if (failures.length) {
  console.error('\nBundle budget exceeded:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('\nBundle budgets passed.')
