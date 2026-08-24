/**
 * O portão do cutover: o modelo novo devolve a MESMA verdade? (PREP-T10d)
 *
 *   npx tsx scripts/cutover-equivalence.ts
 *
 * Cutover é o primeiro passo irreversível da frente. A decisão de dá-lo não
 * pode se apoiar em "parece certo": este script compara, para cada perfil real,
 * o que o legado diz e o que o modelo novo diz — e falha se divergirem.
 *
 * Também mede a perda na direção inversa, que é o que decide a FORMA do
 * cutover (ver o relatório no fim).
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { splitKitType, requirementNaturalKey } from '../lib/requirements'
import { statusFromLegacy } from '../lib/acquisition'

config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('Faltam credenciais'); process.exit(1) }

const admin = createClient(URL, KEY, { auth: { persistSession: false } })

let pass = 0
let fail = 0
const ok = (l: string) => { pass += 1; console.log(`✅ ${l}`) }
const no = (l: string, d = '') => { fail += 1; console.log(`❌ ${l}${d ? `: ${d}` : ''}`) }

async function main() {
  const { data: perfis } = await admin.from('profiles').select('id, name')
  const { data: kits } = await admin.from('kits').select('id, profile_id, slug')
  const slugPorId = new Map((kits ?? []).map(k => [k.id as string, k.slug as string]))

  let comDado = 0
  let divergentes = 0
  let perdaInversa = 0

  for (const perfil of perfis ?? []) {
    const uid = perfil.id as string
    const [{ data: legado }, { data: novo }] = await Promise.all([
      admin.from('checklists')
        .select('canonical_key, kit_type, item_name, tier, quantity, acquired, status')
        .eq('profile_id', uid),
      admin.from('requirements')
        .select('resource_key, kit_id, label, tier, quantity, status, provenance')
        .eq('profile_id', uid),
    ])
    if (!legado?.length && !novo?.length) continue
    comDado += 1

    // ── O legado projetado na forma nova ──────────────────────────────────
    const esperado = new Map<string, { status: string; label: string }>()
    for (const l of legado ?? []) {
      const { kitSlug } = splitKitType(l.kit_type)
      const chave = requirementNaturalKey({ resourceKey: l.canonical_key, kitSlug })
      esperado.set(chave, {
        status: l.status ?? statusFromLegacy(l.acquired),
        label: l.item_name,
      })
    }

    // ── O que o modelo novo realmente tem ─────────────────────────────────
    const obtido = new Map<string, { status: string; label: string }>()
    for (const n of novo ?? []) {
      const kitSlug = n.kit_id ? slugPorId.get(n.kit_id) ?? null : null
      obtido.set(requirementNaturalKey({ resourceKey: n.resource_key, kitSlug }), {
        status: n.status, label: n.label,
      })
    }

    const faltando = [...esperado.keys()].filter(k => !obtido.has(k))
    const sobrando = [...obtido.keys()].filter(k => !esperado.has(k))
    const diferentes = [...esperado.entries()].filter(([k, v]) => {
      const o = obtido.get(k)
      return o && (o.status !== v.status || o.label !== v.label)
    })

    if (faltando.length || sobrando.length || diferentes.length) {
      divergentes += 1
      no(`perfil ${perfil.name ?? uid}`,
        `faltando ${faltando.length}, sobrando ${sobrando.length}, diferentes ${diferentes.length}`)
    }

    /*
     * Perda na direção INVERSA — o que decide a forma do cutover.
     *
     * `kit_type` guarda UMA dimensão. Um requisito que tenha kit E procedência
     * não-manual ao mesmo tempo não cabe nele: escrever de volta perderia uma
     * das duas. Enquanto esse número for zero, a volta ainda é possível.
     */
    for (const n of novo ?? []) {
      if (n.kit_id && n.provenance !== 'MANUAL') perdaInversa += 1
    }
  }

  if (!divergentes) ok(`os ${comDado} perfis com dado batem entre legado e modelo novo`)

  console.log('\n┌─ Direção inversa (requirements → checklists)')
  console.log(`│ requisitos que NÃO cabem em kit_type: ${perdaInversa}`)
  console.log('│')
  if (perdaInversa === 0) {
    console.log('│ Hoje a volta ainda é possível: nenhum requisito tem kit E')
    console.log('│ procedência ao mesmo tempo. Mas isso é sorte do dado atual,')
    console.log('│ não garantia do modelo — o primeiro item da Bug Out sugerido')
    console.log('│ pelo Pilot torna a volta lossy para sempre.')
  } else {
    console.log('│ A VOLTA JÁ É IMPOSSÍVEL sem perda. O cutover não pode manter')
    console.log('│ `checklists` em sincronia; ele precisa CONGELÁ-LA.')
  }
  console.log('└─')

  console.log(`\n${pass} passou · ${fail} falhou`)
  process.exit(fail ? 1 : 0)
}

void main()
