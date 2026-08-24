/**
 * Backfill do Preparedness State (PREP-T10c / D-173).
 *
 * Estágio 4 de `docs/37` §28: projeta o legado no modelo novo.
 *
 *   npx tsx scripts/backfill-preparedness.ts            simulação a seco
 *   npx tsx scripts/backfill-preparedness.ts --apply    escreve
 *
 * ── Simulação a seco por padrão, e não por opção ──────────────────────────
 *
 * Rodar sem argumento NÃO escreve. Um backfill cujo modo perigoso é o padrão é
 * um acidente esperando o dedo errado — e este roda contra o banco de produção,
 * com Stripe ao vivo.
 *
 * ── Re-executável sem duplicar ────────────────────────────────────────────
 *
 * Requisitos reusam `syncRequirement`, que já lê-então-escreve e é a mesma
 * função da escrita dupla (D-172) — validada contra o banco. Holdings usam
 * `upsert` no índice `(profile_id, location_id, resource_key)`, que é de
 * colunas simples e portanto alcançável por `on_conflict`.
 *
 * Rodar duas vezes deve produzir exatamente o mesmo estado. O relatório mostra
 * criados × atualizados justamente para isso ficar visível.
 *
 * ── O que ele NÃO faz ─────────────────────────────────────────────────────
 *
 * Não apaga nada, não altera `checklists` nem `resource_inventory`, e não muda
 * de onde o app lê. O legado continua sendo a verdade até o cutover (T10d).
 * Se o resultado não agradar, as tabelas novas podem ser esvaziadas sem
 * consequência.
 */
import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { syncRequirement, type ChecklistWrite } from '../lib/requirements-sync'
import { projectLegacyInventory, DEFAULT_LOCATION_NAME, type LegacyInventory } from '../lib/holdings'

config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const APLICAR = process.argv.includes('--apply')
const admin = createClient(URL, KEY, { auth: { persistSession: false } })

type Contagem = {
  perfis: number
  checklistLidos: number
  requisitosEscritos: number
  inventariosLidos: number
  holdingsEscritos: number
  locaisCriados: number
  erros: number
}

async function ensureLocation(db: SupabaseClient, profileId: string, contagem: Contagem): Promise<string | null> {
  const existente = await db
    .from('locations').select('id')
    .eq('profile_id', profileId).eq('is_default', true).maybeSingle()
  if (existente.data?.id) return existente.data.id

  if (!APLICAR) { contagem.locaisCriados += 1; return 'DRY-RUN' }

  const criado = await db
    .from('locations')
    .insert({ profile_id: profileId, name: DEFAULT_LOCATION_NAME, kind: 'HOME', is_default: true })
    .select('id').maybeSingle()
  if (criado.data?.id) { contagem.locaisCriados += 1; return criado.data.id }

  const relido = await db
    .from('locations').select('id')
    .eq('profile_id', profileId).eq('is_default', true).maybeSingle()
  return relido.data?.id ?? null
}

async function main() {
  const contagem: Contagem = {
    perfis: 0, checklistLidos: 0, requisitosEscritos: 0,
    inventariosLidos: 0, holdingsEscritos: 0, locaisCriados: 0, erros: 0,
  }

  console.log(APLICAR ? '⚠  MODO ESCRITA — vai gravar no banco\n' : '🔍 SIMULAÇÃO A SECO — nada será gravado\n')

  const { data: perfis, error } = await admin.from('profiles').select('id')
  if (error) { console.error('Falha lendo perfis:', error.message); process.exit(1) }

  for (const perfil of perfis ?? []) {
    const uid = perfil.id as string

    const [{ data: itens }, { data: inv }] = await Promise.all([
      admin.from('checklists')
        .select('canonical_key, item_name, tier, quantity, unit, acquired, kit_type, status')
        .eq('profile_id', uid),
      admin.from('resource_inventory')
        .select('water_liters, food_days, fuel_liters, battery_percent, has_medical_kit, has_communication_device, cash_amount')
        .eq('profile_id', uid).maybeSingle(),
    ])

    const temChecklist = (itens?.length ?? 0) > 0
    const temInventario = Boolean(inv)
    if (!temChecklist && !temInventario) continue

    contagem.perfis += 1
    contagem.checklistLidos += itens?.length ?? 0
    if (temInventario) contagem.inventariosLidos += 1

    const locationId = await ensureLocation(admin, uid, contagem)
    if (!locationId) { contagem.erros += 1; continue }

    // ── Requisitos ────────────────────────────────────────────────────────
    for (const item of itens ?? []) {
      if (APLICAR) {
        await syncRequirement(admin, uid, item as ChecklistWrite)
      }
      contagem.requisitosEscritos += 1
    }

    // ── Holdings ──────────────────────────────────────────────────────────
    if (inv && locationId !== 'DRY-RUN') {
      const holdings = projectLegacyInventory(inv as LegacyInventory, locationId)
      if (holdings.length && APLICAR) {
        const { error: erroH } = await admin.from('holdings').upsert(
          holdings.map(h => ({
            profile_id: uid,
            location_id: h.locationId,
            resource_key: h.resourceKey,
            label: h.label,
            kind: h.kind,
            quantity: h.quantity,
            unit: h.unit,
          })),
          { onConflict: 'profile_id,location_id,resource_key' },
        )
        if (erroH) { console.error(`  ✖ holdings ${uid}: ${erroH.message}`); contagem.erros += 1 }
      }
      contagem.holdingsEscritos += holdings.length
    } else if (inv) {
      contagem.holdingsEscritos += projectLegacyInventory(inv as LegacyInventory, 'x').length
    }
  }

  console.log('┌─ Backfill ' + (APLICAR ? '(APLICADO)' : '(simulação)'))
  console.log(`│ perfis com dado ......... ${contagem.perfis}`)
  console.log(`│ locais padrão criados ... ${contagem.locaisCriados}`)
  console.log(`│ itens de checklist lidos  ${contagem.checklistLidos}`)
  console.log(`│ requisitos escritos ..... ${contagem.requisitosEscritos}`)
  console.log(`│ inventários lidos ....... ${contagem.inventariosLidos}`)
  console.log(`│ holdings escritos ....... ${contagem.holdingsEscritos}`)
  console.log(`└ erros ................... ${contagem.erros}`)

  if (!APLICAR) console.log('\nNada foi gravado. Reveja os números e rode com --apply.')
  process.exit(contagem.erros ? 1 : 0)
}

void main()
