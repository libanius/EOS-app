/** Bundle executable code locally; model weights are never part of installation/precache. */
import { build } from 'esbuild'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
const entries = { 'local-ai-runtime.js': 'local-ai/runtime.ts', 'local-ai-worker.js': 'local-ai/worker.ts' }
for (const [file, entry] of Object.entries(entries)) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'browser', format: 'iife',
    target: ['es2020'], minify: true, legalComments: 'inline', write: false, logLevel: 'silent' })
  const content = result.outputFiles[0].text
  for (const dir of ['public', ...(!process.env.VERCEL && existsSync('native/package.json') ? ['native/www'] : [])]) {
    const path = `${dir}/${file}`
    if (process.argv.includes('--check')) {
      if (readFileSync(path, 'utf8') !== content) throw new Error(`Stale local AI artifact: ${path}`)
    } else writeFileSync(path, content)
  }
}
