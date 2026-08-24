/**
 * A leitura de requisitos depois do cutover (PREP-T10d / D-176).
 *
 * Estágio 5 de `docs/37` §28. `requirements` passa a ser a verdade;
 * `checklists` vira **retrato congelado** para rollback.
 *
 * ── Por que congelar, e não sincronizar ───────────────────────────────────
 *
 * O espelho invertido é impossível por construção. `checklists.kit_type` guarda
 * UMA dimensão, e um requisito com kit **e** procedência não cabe nele — é
 * exatamente o defeito que D-161 desfez. Manter as duas em sincronia exigiria
 * escolher qual das duas informações perder a cada escrita.
 *
 * `npm run test:cutover-gate` mediu isso antes da decisão: hoje há 0 casos, mas
 * é sorte do dado atual. O primeiro item da Bug Out sugerido pelo Pilot torna a
 * volta lossy para sempre.
 *
 * ── A forma da resposta não muda ──────────────────────────────────────────
 *
 * A API continua devolvendo os mesmos campos de antes, para que nenhuma tela
 * precise mudar junto com o banco. Ganha dois campos NOVOS e autoritativos —
 * `kit_slug` e `provenance` — que substituem a adivinhação de `splitKitType`
 * sobre o `kit_type` sintetizado.
 *
 * `kit_type` continua saindo, best-effort, para as telas legadas. Ele é a
 * projeção lossy; quem tiver os campos novos deve preferi-los.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { legacyFromStatus, type AcquisitionStatus } from '@/lib/acquisition'
import type { Provenance } from '@/lib/requirements'

/** O valor legado de `kit_type` que corresponde a uma procedência. */
const LEGACY_KIT_BY_PROVENANCE: Partial<Record<Provenance, string>> = {
  PILOT: 'PILOT_RECOMMENDATION',
  EDU: 'EDU_CONTENT',
  SIMULATION: 'SIMULATION_DEBRIEF',
  OFFICIAL_ALERT: 'OFFICIAL_ALERT',
}

export type ChecklistApiItem = {
  id: string
  scenario_id: string | null
  kit_type: string
  kit_slug: string | null
  provenance: Provenance
  canonical_key: string
  item_name: string
  tier: string
  quantity: number
  unit: string | null
  acquired: boolean
  acquired_at: null
  status: AcquisitionStatus
  shared: boolean
}

/**
 * `kit_type` sintetizado — a projeção LOSSY, e assumida como tal.
 *
 * Kit vence procedência: pertencer à Bug Out é mais útil na tela legada do que
 * saber que o Pilot sugeriu. Quem precisa dos dois lê `kit_slug` e
 * `provenance`, que vêm ao lado e são exatos.
 */
export function legacyKitType(kitSlug: string | null, provenance: Provenance): string {
  if (kitSlug) return kitSlug
  return LEGACY_KIT_BY_PROVENANCE[provenance] ?? 'GERAL'
}

type RequirementRow = {
  id: string
  resource_key: string
  label: string
  tier: string
  quantity: number | string
  unit: string | null
  status: AcquisitionStatus
  provenance: Provenance
  kit_id: string | null
  scenario_id: string | null
}

/**
 * Os requisitos do usuário, na forma que a API sempre devolveu.
 *
 * A ordenação repete a de antes — kit, tier, nome — para que a lista não
 * embaralhe na virada. Uma tela que reordena sozinha faz o usuário achar que
 * perdeu itens.
 */
export async function readRequirements(
  db: SupabaseClient,
  profileId: string,
): Promise<{ items: ChecklistApiItem[]; error: string | null }> {
  const [reqs, kits] = await Promise.all([
    db.from('requirements')
      .select('id, resource_key, label, tier, quantity, unit, status, provenance, kit_id, scenario_id')
      .eq('profile_id', profileId),
    db.from('kits').select('id, slug').eq('profile_id', profileId),
  ])

  if (reqs.error) return { items: [], error: reqs.error.message }

  const slugPorId = new Map((kits.data ?? []).map(k => [k.id as string, k.slug as string]))

  // O mesmo recurso em mais de um kit: a tela marca como compartilhado.
  const vezes = new Map<string, number>()
  for (const r of (reqs.data ?? []) as RequirementRow[]) {
    vezes.set(r.resource_key, (vezes.get(r.resource_key) ?? 0) + 1)
  }

  const items = ((reqs.data ?? []) as RequirementRow[]).map(r => {
    const kitSlug = r.kit_id ? slugPorId.get(r.kit_id) ?? null : null
    return {
      id: r.id,
      scenario_id: r.scenario_id,
      kit_type: legacyKitType(kitSlug, r.provenance),
      kit_slug: kitSlug,
      provenance: r.provenance,
      canonical_key: r.resource_key,
      item_name: r.label,
      tier: r.tier,
      quantity: Number(r.quantity) || 0,
      unit: r.unit,
      // `acquired` continua saindo porque telas legadas ainda o leem. Ele é
      // derivado, não guardado: a verdade é `status`.
      acquired: legacyFromStatus(r.status),
      acquired_at: null as null,
      status: r.status,
      shared: (vezes.get(r.resource_key) ?? 0) > 1,
    }
  })

  items.sort((a, b) =>
    a.kit_type.localeCompare(b.kit_type)
    || a.tier.localeCompare(b.tier)
    || a.item_name.localeCompare(b.item_name))

  return { items, error: null }
}
