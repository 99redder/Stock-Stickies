import { readFile, stat } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const budgets = {
  entryBytes: 900_000,
  entryGzipBytes: 260_000,
  asyncBytes: 250_000,
  asyncGzipBytes: 80_000,
}

const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'))
const javascriptFiles = [...new Set(
  Object.values(manifest)
    .map((chunk) => chunk.file)
    .filter((file) => file.endsWith('.js'))
)]
const entryFiles = new Set(
  Object.values(manifest)
    .filter((chunk) => chunk.isEntry)
    .map((chunk) => chunk.file)
)
const failures = []

for (const file of javascriptFiles) {
  const path = `dist/${file}`
  const source = await readFile(path)
  const rawBytes = (await stat(path)).size
  const gzipBytes = gzipSync(source).length
  const isEntry = entryFiles.has(file)
  const rawLimit = isEntry ? budgets.entryBytes : budgets.asyncBytes
  const gzipLimit = isEntry ? budgets.entryGzipBytes : budgets.asyncGzipBytes
  const label = isEntry ? 'entry' : 'async'

  console.log(`${label.padEnd(5)} ${file}: ${(rawBytes / 1024).toFixed(1)} KB raw, ${(gzipBytes / 1024).toFixed(1)} KB gzip`)
  if (rawBytes > rawLimit) failures.push(`${file} is ${rawBytes} bytes; budget is ${rawLimit}`)
  if (gzipBytes > gzipLimit) failures.push(`${file} is ${gzipBytes} bytes gzipped; budget is ${gzipLimit}`)
}

if (failures.length) {
  console.error('\nBundle budget exceeded:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('\nBundle budgets passed.')
