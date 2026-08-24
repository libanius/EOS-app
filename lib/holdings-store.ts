/**
 * Leitura do Preparedness State, com a migração podendo ainda não ter rodado
 * (PREP-T04 / D-160).
 *
 * Neste repositório o agente escreve a migração e o DONO a aplica no SQL Editor
 * — não há credencial de banco no ambiente do agente (mesmo padrão de D-038 e
 * do Stripe). Existe portanto uma janela real, de horas ou dias, em que o
 * código novo está em produção e as tabelas novas não existem.
 *
 * Esse intervalo já mordeu este projeto antes: um banner "migration pendente"
 * falso, aceso porque `tableMissing()` tratava erro de COLUNA como tabela
 * ausente. A lição ficou: só `42P01` é tabela inexistente, e só ele degrada.
 * Qualquer outro erro é erro de verdade e não pode ser mascarado — mascarar
 * falha de leitura num app de emergência é como o Pilot dizer "pode ir" quando
 * não sabe.
 *
 * Enquanto as tabelas não existem, `getPreparednessState()` devolve a PROJEÇÃO
 * do modelo antigo. A tela não muda, o número não muda, e nada quebra.
 */

import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_LOCATION_NAME,
  projectLegacyInventory,
  type EosLocation,
  type Holding,
  type LegacyInventory,
} from '@/lib/holdings'

/** Só tabela inexistente. Erro de coluna é erro, não migração pendente. */
function tableMissing(error: { code?: string } | null): boolean {
  return error?.code === '42P01'
}

/**
 * Id sintético da casa quando as tabelas ainda não existem.
 *
 * Não é uuid de propósito: se algum dia este valor chegar num INSERT, o banco
 * recusa em vez de gravar uma linha órfã que ninguém entenderia depois.
 */
export const PROJECTED_HOME_ID = 'projected-home'

export type PreparednessState = {
  locations: EosLocation[]
  holdings: Holding[]
  /** Id da raiz da casa — é dela que a autonomia é lida (D-156). */
  homeLocationId: string
  /** `legacy` = tabelas novas ainda não existem ou estão vazias. */
  source: 'holdings' | 'legacy'
  /** A migração ainda não foi aplicada neste banco. */
  migrationPending: boolean
}

type LocationRow = {
  id: string
  parent_id: string | null
  name: string
  kind: EosLocation['kind']
  is_default: boolean
}

type HoldingRow = {
  location_id: string
  resource_key: string
  label: string
  kind: Holding['kind']
  quantity: number | string
  unit: string | null
}

/**
 * A casa padrão, criada sob demanda e nunca duplicada.
 *
 * A unicidade é garantida pelo índice parcial `locations_one_default_per_profile`,
 * não por este código: duas requisições simultâneas do mesmo usuário — duas
 * abas, o app e o service worker — chegariam juntas aqui, e a corrida se
 * resolve no banco. Em conflito, relemos em vez de estourar.
 *
 * Devolve `null` quando a migração ainda não rodou.
 */
export async function ensureDefaultLocation(profileId: string): Promise<string | null> {
  const supabase = await createClient()

  const existing = await supabase
    .from('locations')
    .select('id')
    .eq('profile_id', profileId)
    .eq('is_default', true)
    .maybeSingle()

  if (existing.error && tableMissing(existing.error)) return null
  if (existing.data?.id) return existing.data.id

  const created = await supabase
    .from('locations')
    .insert({ profile_id: profileId, name: DEFAULT_LOCATION_NAME, kind: 'HOME', is_default: true })
    .select('id')
    .maybeSingle()

  if (created.error && tableMissing(created.error)) return null

  if (created.error) {
    // Corrida perdida: outra requisição criou a casa entre o SELECT e o INSERT.
    const again = await supabase
      .from('locations')
      .select('id')
      .eq('profile_id', profileId)
      .eq('is_default', true)
      .maybeSingle()
    return again.data?.id ?? null
  }

  return created.data?.id ?? null
}

/**
 * O estado de preparação como o resto do app deve lê-lo.
 *
 * Uma porta só, para que nenhuma tela precise saber se a migração já rodou.
 */
export async function getPreparednessState(
  profileId: string,
  legacyInventory: LegacyInventory | null,
): Promise<PreparednessState> {
  const supabase = await createClient()

  const [locationsResult, holdingsResult] = await Promise.all([
    supabase
      .from('locations')
      .select('id, parent_id, name, kind, is_default')
      .eq('profile_id', profileId),
    supabase
      .from('holdings')
      .select('location_id, resource_key, label, kind, quantity, unit')
      .eq('profile_id', profileId),
  ])

  const pending = tableMissing(locationsResult.error) || tableMissing(holdingsResult.error)

  if (pending) return projectedState(legacyInventory)

  /*
   * Erro que NÃO é tabela ausente: não projetamos. Devolver o legado aqui
   * esconderia uma falha de leitura atrás de um número plausível, e um número
   * plausível e errado gasta a confiança que o número certo vai precisar.
   */
  if (locationsResult.error) throw new Error(`locations: ${locationsResult.error.message}`)
  if (holdingsResult.error) throw new Error(`holdings: ${holdingsResult.error.message}`)

  const locations: EosLocation[] = (locationsResult.data as LocationRow[] ?? []).map(row => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind,
    isDefault: row.is_default,
  }))

  /*
   * Tabelas existem e estão vazias: é o estado normal antes do backfill
   * (estágio 4 de docs/37 §28). Projetar o legado é o comportamento correto —
   * e é o que mantém a autonomia idêntica durante toda a transição.
   */
  if (!locations.length) return projectedState(legacyInventory)

  const home = locations.find(l => l.isDefault) ?? locations[0]
  const holdings: Holding[] = (holdingsResult.data as HoldingRow[] ?? []).map(row => ({
    locationId: row.location_id,
    resourceKey: row.resource_key,
    label: row.label,
    kind: row.kind,
    quantity: Number(row.quantity) || 0,
    unit: row.unit,
  }))

  if (!holdings.length) {
    return { ...projectedState(legacyInventory, home.id), locations, homeLocationId: home.id }
  }

  return { locations, holdings, homeLocationId: home.id, source: 'holdings', migrationPending: false }
}

function projectedState(
  legacyInventory: LegacyInventory | null,
  homeId: string = PROJECTED_HOME_ID,
): PreparednessState {
  return {
    locations: [{ id: homeId, parentId: null, name: DEFAULT_LOCATION_NAME, kind: 'HOME', isDefault: true }],
    holdings: projectLegacyInventory(legacyInventory, homeId),
    homeLocationId: homeId,
    source: 'legacy',
    migrationPending: homeId === PROJECTED_HOME_ID,
  }
}
