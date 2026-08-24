/**
 * Escrita dupla: `checklists` → `requirements` (PREP-T10b / D-172).
 *
 * Estágio 3 de `docs/37` §28. Toda escrita nova passa a existir nas duas
 * formas; o legado continua sendo a verdade até o cutover.
 *
 * ── A regra que manda em tudo aqui ────────────────────────────────────────
 *
 * **A escrita nova NUNCA derruba a legada.** Se espelhar falhar, o item do
 * checklist já foi gravado e a pessoa vê o que esperava; a falha vira linha no
 * `error_log` e nada mais. O contrário — deixar o espelho derrubar a escrita
 * real — transformaria uma tabela que ninguém ainda lê num ponto único de
 * falha para uma tabela de que o app inteiro depende.
 *
 * ── Por que ler-então-escrever, e não upsert ──────────────────────────────
 *
 * A chave natural de `requirements` usa `COALESCE(kit_id, sentinela)` porque no
 * Postgres `NULL` é distinto de `NULL` num índice único (D-161). Índice de
 * EXPRESSÃO não pode ser alvo de `on_conflict` pelo PostgREST, que só aceita
 * nomes de coluna.
 *
 * Então: lê, decide, escreve. A corrida entre duas requisições do mesmo usuário
 * resolve no banco — o índice único recusa a segunda —, e nesse caso relemos em
 * vez de estourar. É o mesmo padrão de `ensureDefaultLocation`.
 *
 * ── Por que `holdings` NÃO está aqui ──────────────────────────────────────
 *
 * `holdings` é integralmente derivável de `resource_inventory` pelo adaptador
 * de PREP-T04. Espelhar o que já se projeta adicionaria risco de divergência
 * sem adicionar informação nenhuma. Ela é preenchida de uma vez no backfill.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logError } from '@/lib/error-log'
import { splitKitType, type Provenance } from '@/lib/requirements'
import { statusFromLegacy, type AcquisitionStatus } from '@/lib/acquisition'

/** Nomes de exibição dos kits conhecidos. Slug desconhecido vira o próprio. */
const KIT_NAMES: Record<string, string> = {
  BUG_OUT: 'Bug Out',
  ACAMPAMENTO: 'Acampamento',
  PESCA: 'Pesca',
  CACA: 'Caça',
}

export type ChecklistWrite = {
  canonical_key: string
  item_name: string
  tier: 'ESSENTIAL' | 'MODERATE' | 'EXCELLENT'
  quantity: number
  unit: string | null
  acquired: boolean
  kit_type: string | null
  status?: AcquisitionStatus | null
}

export type RequirementRow = {
  profile_id: string
  resource_key: string
  label: string
  quantity: number
  unit: string | null
  kit_id: string | null
  tier: ChecklistWrite['tier']
  status: AcquisitionStatus
  provenance: Provenance
}

/**
 * A linha de `requirements` que corresponde a uma escrita no checklist.
 *
 * Pura de propósito: é a tradução entre as duas formas, e a parte mais fácil de
 * errar sem que nada quebre visivelmente — um espelho errado só aparece no
 * cutover, quando já é tarde.
 */
export function requirementRowFor(
  profileId: string,
  row: ChecklistWrite,
  kitId: string | null,
): RequirementRow {
  const { provenance } = splitKitType(row.kit_type)
  return {
    profile_id: profileId,
    resource_key: row.canonical_key,
    label: row.item_name,
    quantity: Number(row.quantity) || 1,
    unit: row.unit,
    kit_id: kitId,
    tier: row.tier,
    // `status` explícito vence; senão deriva do booleano legado.
    status: row.status ?? statusFromLegacy(row.acquired),
    provenance,
  }
}

/**
 * O kit, criado sob demanda pelo slug e nunca duplicado.
 *
 * Devolve `null` quando o item é de linha de base (`GERAL`, vazio, ou vindo de
 * uma procedência) — nesses casos `kit_id` fica nulo, que é o que D-161
 * definiu como requisito da casa.
 */
async function resolveKitId(
  db: SupabaseClient,
  profileId: string,
  kitSlug: string | null,
): Promise<string | null> {
  if (!kitSlug) return null

  const existente = await db
    .from('kits')
    .select('id')
    .eq('profile_id', profileId)
    .eq('slug', kitSlug)
    .maybeSingle()
  if (existente.data?.id) return existente.data.id

  const criado = await db
    .from('kits')
    .insert({ profile_id: profileId, slug: kitSlug, name: KIT_NAMES[kitSlug] ?? kitSlug })
    .select('id')
    .maybeSingle()
  if (criado.data?.id) return criado.data.id

  // Corrida perdida: outra requisição criou o kit entre o SELECT e o INSERT.
  const relido = await db
    .from('kits')
    .select('id')
    .eq('profile_id', profileId)
    .eq('slug', kitSlug)
    .maybeSingle()
  return relido.data?.id ?? null
}

/** Localiza o requisito pela chave natural, tratando `NULL` como valor. */
async function findRequirementId(
  db: SupabaseClient,
  profileId: string,
  resourceKey: string,
  kitId: string | null,
): Promise<string | null> {
  let q = db
    .from('requirements')
    .select('id')
    .eq('profile_id', profileId)
    .eq('resource_key', resourceKey)
    .is('scenario_id', null)
  q = kitId === null ? q.is('kit_id', null) : q.eq('kit_id', kitId)
  const { data } = await q.maybeSingle()
  return data?.id ?? null
}

/**
 * Espelha uma escrita do checklist em `requirements`.
 *
 * **Nunca lança.** Falha é registrada e engolida — ver o cabeçalho.
 */
export async function syncRequirement(
  db: SupabaseClient,
  profileId: string,
  row: ChecklistWrite,
): Promise<void> {
  try {
    const { kitSlug } = splitKitType(row.kit_type)
    const kitId = await resolveKitId(db, profileId, kitSlug)
    const alvo = requirementRowFor(profileId, row, kitId)
    const existenteId = await findRequirementId(db, profileId, alvo.resource_key, kitId)

    if (existenteId) {
      /*
       * Atualiza, não insere. É a regra do D-155 §26.2: o mesmo item achado por
       * duas fontes ATUALIZA a procedência em vez de criar segunda linha.
       */
      const { error } = await db.from('requirements').update(alvo).eq('id', existenteId)
      if (error) throw error
      return
    }

    const { error } = await db.from('requirements').insert(alvo)
    // Índice único disparou: outra requisição inseriu no meio. Não é erro —
    // é a corrida se resolvendo onde deve, no banco.
    if (error && error.code !== '23505') throw error
  } catch (error) {
    await logError('requirements-sync:write', error, {
      userId: profileId,
      context: { resource_key: row.canonical_key, kit_type: row.kit_type },
    })
  }
}

/** Espelha várias escritas. Uma falha não impede as outras. */
export async function syncRequirements(
  db: SupabaseClient,
  profileId: string,
  rows: ChecklistWrite[],
): Promise<void> {
  for (const row of rows) await syncRequirement(db, profileId, row)
}

/**
 * Espelha a exclusão.
 *
 * Apagar no legado apaga o espelho: deixar o requisito órfão faria a prontidão
 * contar uma falta que o usuário já resolveu removendo o item.
 */
export async function removeRequirement(
  db: SupabaseClient,
  profileId: string,
  canonicalKey: string,
  kitType: string | null,
): Promise<void> {
  try {
    const { kitSlug } = splitKitType(kitType)
    const kitId = await resolveKitId(db, profileId, kitSlug)
    const id = await findRequirementId(db, profileId, canonicalKey, kitId)
    if (!id) return
    const { error } = await db.from('requirements').delete().eq('id', id)
    if (error) throw error
  } catch (error) {
    await logError('requirements-sync:delete', error, {
      userId: profileId,
      context: { canonical_key: canonicalKey, kit_type: kitType },
    })
  }
}
