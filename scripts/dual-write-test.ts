/**
 * Escrita dupla contra o banco de verdade (PREP-T10b / D-172).
 *
 * Teste unitário prova a TRADUÇÃO; só o banco prova a ESCRITA. O que importa
 * aqui é o que nenhum mock pegaria: o kit criado sob demanda sem duplicar, a
 * chave natural com `NULL` tratado como valor, a segunda gravação atualizando
 * em vez de inserir, e a exclusão levando o espelho junto.
 *
 * Cria um perfil temporário e o remove no fim, como os outros testes do repo.
 *
 *   npm run test:dual-write
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { syncRequirement, removeRequirement, type ChecklistWrite } from '../lib/requirements-sync'

config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(URL, KEY, { auth: { persistSession: false } })

let pass = 0
let fail = 0
const ok = (label: string) => { pass += 1; console.log(`✅ ${label}`) }
const no = (label: string, detail = '') => { fail += 1; console.log(`❌ ${label}${detail ? `: ${detail}` : ''}`) }

const linha = (over: Partial<ChecklistWrite> = {}): ChecklistWrite => ({
  canonical_key: 'agua-teste',
  item_name: 'Água (teste)',
  tier: 'ESSENTIAL',
  quantity: 4,
  unit: 'gal',
  acquired: false,
  kit_type: 'GERAL',
  ...over,
})

async function main() {
  const email = `eos-dw-${Date.now()}@test.internal`
  const { data: criado, error: erroUser } = await admin.auth.admin.createUser({
    email, password: 'EosTest#2026!', email_confirm: true,
  })
  if (erroUser || !criado.user) {
    console.error('Falha criando usuário temporário', erroUser?.message)
    process.exit(1)
  }
  const uid = criado.user.id

  const requisitos = () => admin.from('requirements').select('*').eq('profile_id', uid)
  const kits = () => admin.from('kits').select('*').eq('profile_id', uid)

  try {
    // ── 1. Linha de base: sem kit ───────────────────────────────────────────
    await syncRequirement(admin, uid, linha())
    let r = await requisitos()
    r.data?.length === 1 && r.data[0].kit_id === null && r.data[0].provenance === 'MANUAL'
      ? ok('GERAL vira requisito de linha de base, sem kit')
      : no('linha de base errada', JSON.stringify(r.data))

    // ── 2. Idempotência ─────────────────────────────────────────────────────
    await syncRequirement(admin, uid, linha({ quantity: 9 }))
    r = await requisitos()
    r.data?.length === 1 && Number(r.data[0].quantity) === 9
      ? ok('gravar de novo ATUALIZA, não duplica')
      : no('duplicou ou não atualizou', `${r.data?.length} linha(s)`)

    // ── 3. Kit criado sob demanda, uma vez só ───────────────────────────────
    await syncRequirement(admin, uid, linha({ kit_type: 'BUG_OUT' }))
    await syncRequirement(admin, uid, linha({ kit_type: 'BUG_OUT', quantity: 2 }))
    const k = await kits()
    k.data?.length === 1 && k.data[0].slug === 'BUG_OUT'
      ? ok('o kit é criado sob demanda e não duplica')
      : no('kit duplicado ou ausente', JSON.stringify(k.data))

    // ── 4. A chave natural separa kit de linha de base ──────────────────────
    r = await requisitos()
    r.data?.length === 2
      ? ok('mesmo recurso em kits diferentes são requisitos diferentes')
      : no('a chave natural não separou', `${r.data?.length} linha(s)`)

    // ── 5. Procedência não duplica (D-155 §26.2) ────────────────────────────
    await syncRequirement(admin, uid, linha({ kit_type: 'PILOT_RECOMMENDATION' }))
    r = await requisitos()
    const base = r.data?.filter(x => x.kit_id === null) ?? []
    base.length === 1 && base[0].provenance === 'PILOT'
      ? ok('outra fonte ATUALIZA a procedência, não cria segunda linha')
      : no('procedência duplicou', JSON.stringify(base))

    // ── 6. Estado explícito sobrevive ao espelho ────────────────────────────
    await syncRequirement(admin, uid, linha({ status: 'not_applicable' }))
    r = await requisitos()
    r.data?.find(x => x.kit_id === null)?.status === 'not_applicable'
      ? ok('"não se aplica" chega ao modelo novo')
      : no('status não espelhado')

    // ── 7. Exclusão leva o espelho ──────────────────────────────────────────
    await removeRequirement(admin, uid, 'agua-teste', 'GERAL')
    r = await requisitos()
    const orfaos = r.data?.filter(x => x.kit_id === null).length ?? -1
    orfaos === 0
      ? ok('apagar no legado apaga o espelho')
      : no('requisito ficou órfão', `${orfaos} órfão(s)`)

    // ── 8. Apagar o que não existe não estoura ──────────────────────────────
    await removeRequirement(admin, uid, 'nao-existe', 'GERAL')
    ok('apagar inexistente é silencioso')
  } catch (error) {
    no('erro inesperado', error instanceof Error ? error.message : String(error))
  } finally {
    await admin.auth.admin.deleteUser(uid).catch(() => {})
    console.log('   [limpeza] usuário temporário removido')
  }

  console.log(`\n${pass} passou · ${fail} falhou`)
  process.exit(fail ? 1 : 0)

}

void main()
