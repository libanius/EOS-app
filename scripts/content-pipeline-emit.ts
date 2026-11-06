// Emite a pauta do FORTRESS (fixture) com hash, para o teste SQL. Uso: tsx scripts/content-pipeline-emit.ts <versão> [edit|video|archive]
import { fortressPackage } from '../lib/__tests__/fixtures/content-fortress'
import { packageHash } from '../lib/content-package'

const version = Number(process.argv[2] || 1)
const mode = process.argv[3]
const pkg = fortressPackage({
  version,
  ...(mode === 'video' ? { video: { pt: { youtubeId: 'dQw4w9WgXcQ' } } } : {}),
  ...(mode === 'archive' ? { status: 'archived' as const } : {}),
})
if (mode === 'edit') pkg.signal.curatorNote.pt += ' Editado.'
process.stdout.write(JSON.stringify({ pkg, hash: packageHash(pkg) }))
