import { copyFile, mkdir, writeFile } from 'node:fs/promises'

await mkdir(new URL('../dist/server/', import.meta.url), { recursive: true })
await mkdir(new URL('../dist/.openai/', import.meta.url), { recursive: true })

await writeFile(
  new URL('../dist/server/index.js', import.meta.url),
  `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  }
}
`,
)

await copyFile(
  new URL('../.openai/hosting.json', import.meta.url),
  new URL('../dist/.openai/hosting.json', import.meta.url),
)
