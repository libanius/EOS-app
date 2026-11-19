/** Reproduce the hosted failure: native directory exists, but its excluded sources do not. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, cpSync, symlinkSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

it('Vercel validates/generates web artifacts despite a residual incomplete native cache', () => {
  const root = process.cwd()
  const temp = mkdtempSync(join(tmpdir(), 'eos-vercel-cache-'))
  try {
    for (const dir of ['public', 'lib', 'local-ai', 'native/www']) mkdirSync(join(temp, dir), { recursive: true })
    // Even a cached package marker must not make the cloud build depend on native assets.
    writeFileSync(join(temp, 'native/package.json'), '{"name":"residual-native-cache"}')
    cpSync(join(root, 'local-ai'), join(temp, 'local-ai'), { recursive: true })
    for (const file of ['offline-knowledge.ts', 'pilot-voice.ts', 'local-ai-core.ts']) cpSync(join(root, 'lib', file), join(temp, 'lib', file))
    for (const file of ['knowledge.js', 'knowledge-ui.js', 'offline.html', 'local-ai-runtime.js', 'local-ai-worker.js']) cpSync(join(root, 'public', file), join(temp, 'public', file))
    symlinkSync(join(root, 'node_modules'), join(temp, 'node_modules'), 'dir')
    for (const file of ['build-offline-library.mjs', 'build-local-ai.mjs']) {
      expect(() => execFileSync(process.execPath, [join(root, 'scripts', file), ...(file === 'build-offline-library.mjs' ? ['--check'] : [])], {
        cwd: temp, env: { ...process.env, VERCEL: '1' }, timeout: 30000, stdio: 'pipe',
      })).not.toThrow()
    }
  } finally { rmSync(temp, { recursive: true, force: true }) }
}, 60000)
