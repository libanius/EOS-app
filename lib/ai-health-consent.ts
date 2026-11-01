/**
 * O que a IA pode ler da saúde de cada pessoa (STORE-T01 · D-231).
 *
 * Toda rota que monta prompt para a OpenAI passa a casa por aqui ANTES de
 * escrever uma linha sobre saúde. A regra tem três partes, e nenhuma é opcional:
 *
 * 1. DESLIGADO POR PADRÃO. `profiles.ai_health_consent_at` nulo é "não".
 *
 * 2. O CONSENTIMENTO É DO DONO DO DADO, não de quem pergunta. O Pilot de A pode
 *    estar lendo a ficha de B (casa confirmada, família íntima aprovada); quem
 *    autoriza mandar isso para a OpenAI é B. Um dependente sem conta segue quem
 *    cuida dele — é essa pessoa quem preencheu a ficha e responde por ela.
 *
 * 3. FECHA NA DÚVIDA. Coluna ausente (migração pendente), leitura falha ou
 *    service-role indisponível → ninguém consentiu. Errar para o lado de não
 *    mandar custa uma resposta menos precisa; errar para o outro lado é dado de
 *    saúde num terceiro sem permissão.
 *
 * Quem não consentiu vira `medicalVisible: false` — o MESMO estado de quem não
 * compartilhou a ficha na casa. Isso é deliberado: marcar como oculto só quem
 * TEM algo a esconder já seria revelar que tem. E o modelo continua sabendo que
 * existe ficha que ele não vê, para nunca transformar "não sabemos" em "não tem"
 * (D-174).
 *
 * Só o PROMPT passa por aqui. O motor local (regras, guard, cobertura) segue
 * lendo a casa inteira: ele roda no servidor e não manda nada a ninguém.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/error-log'
import type { Household, HouseholdPerson } from '@/lib/household'

export const AI_HEALTH_CONSENT_COLUMN = 'ai_health_consent_at'

/** Erro do Postgres para coluna inexistente: a migração ainda não foi aplicada. */
export const isConsentColumnMissing = (error: { code?: string } | null | undefined) =>
  error?.code === '42703'

/** Quem responde pela ficha desta pessoa: a própria conta, ou quem cuida dela. */
export function healthOwnerOf(person: Pick<HouseholdPerson, 'userId' | 'dependsOn'>): string | null {
  return person.userId ?? person.dependsOn ?? null
}

export function mayShareHealth(ownerId: string | null | undefined, consented: ReadonlySet<string>): boolean {
  return !!ownerId && consented.has(ownerId)
}

export function redactPersonForAi(person: HouseholdPerson, consented: ReadonlySet<string>): HouseholdPerson {
  if (mayShareHealth(healthOwnerOf(person), consented)) return person
  return {
    ...person,
    medicalConditions: [],
    medications: [],
    mobilityImpaired: false,
    careNotes: null,
    medicalVisible: false,
  }
}

/**
 * A casa como a IA tem permissão de vê-la.
 *
 * `needsHidden` é recontado: passa a incluir quem não autorizou a IA, além de
 * quem não compartilhou a ficha. Tamanho, inventário e quem mora junto não
 * mudam — nada disso é dado de saúde.
 */
export function householdForAi(household: Household, consented: ReadonlySet<string>): Household {
  const people = household.people.map(p => redactPersonForAi(p, consented))
  return {
    ...household,
    people,
    needsHidden: people.filter(p => !p.medicalVisible).length,
  }
}

type HealthFields = {
  blood_type?: string | null
  allergies?: string[] | null
  medications?: string[] | null
  medical_notes?: string | null
}

/** A ficha de uma conta, sem os campos de saúde quando o dono não autorizou. */
export function redactProfileHealthForAi<T extends HealthFields>(
  profile: T | null,
  ownerId: string | null | undefined,
  consented: ReadonlySet<string>,
): { profile: T | null; withheld: boolean } {
  if (!profile || mayShareHealth(ownerId, consented)) return { profile, withheld: false }
  return {
    profile: { ...profile, blood_type: null, allergies: null, medications: null, medical_notes: null },
    withheld: true,
  }
}

/**
 * Quem, entre `ids`, autorizou a IA a ler a própria saúde.
 *
 * Lê com service-role porque precisa do consentimento de OUTRAS pessoas — a RLS
 * de `profiles` só mostra a própria linha. Só a coluna de consentimento sai
 * daqui; nenhum outro campo da linha alheia é lido.
 */
export async function loadAiHealthConsent(
  ids: Iterable<string | null | undefined>,
  client: SupabaseClient | null = createAdminClient(),
): Promise<Set<string>> {
  const unique = Array.from(new Set(Array.from(ids).filter((id): id is string => !!id)))
  if (!unique.length || !client) return new Set()

  const { data, error } = await client
    .from('profiles')
    .select(`id, ${AI_HEALTH_CONSENT_COLUMN}`)
    .in('id', unique)

  if (error) {
    // Migração pendente é estado esperado, não defeito: não polui o error_log.
    if (!isConsentColumnMissing(error)) await logError('ai-health-consent:load', error)
    return new Set()
  }

  return new Set(
    ((data ?? []) as Array<Record<string, unknown>>)
      .filter(row => typeof row.id === 'string' && !!row[AI_HEALTH_CONSENT_COLUMN])
      .map(row => row.id as string),
  )
}
