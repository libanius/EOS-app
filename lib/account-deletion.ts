/**
 * Excluir a conta sem deixar cobrança nem rastro (STORE-T03 · D-231).
 *
 * A ordem é a regra. A cobrança é cancelada ANTES de qualquer linha sumir:
 * uma conta apagada com assinatura viva continua cobrando um cartão de alguém
 * que não tem mais como entrar no app para cancelar — e o webhook, que
 * reconcilia pelo perfil, já não teria perfil para onde escrever.
 *
 * Se o Stripe falhar, nada é apagado. A pessoa tenta de novo; o contrário
 * (apagar e torcer) não tem volta.
 *
 * O cliente Stripe NÃO é excluído: faturas pagas são registro fiscal e ficam
 * na Stripe pelo prazo legal, como a política de privacidade já diz.
 */

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Estados em que a assinatura já não cobra ninguém. */
const DEAD_STATUSES = new Set<string>(['canceled', 'incomplete_expired'])

export type BillingCancellation =
  | { ok: true; cancelled: string[] }
  | { ok: false; reason: 'stripe_unavailable' | 'stripe_error'; detail: string }

export async function cancelBillingBeforeDeletion(
  uid: string,
  admin: SupabaseClient,
  stripe: Stripe | null,
): Promise<BillingCancellation> {
  const { data: profile, error } = await admin
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('id', uid)
    .maybeSingle()
  if (error) return { ok: false, reason: 'stripe_error', detail: `profiles: ${error.message}` }

  const customerId = (profile?.stripe_customer_id as string | null | undefined) ?? null
  const knownSub = (profile?.stripe_subscription_id as string | null | undefined) ?? null
  // Nunca pagou: nada a cancelar, e o Stripe nem precisa estar configurado.
  if (!customerId && !knownSub) return { ok: true, cancelled: [] }
  if (!stripe) return { ok: false, reason: 'stripe_unavailable', detail: 'STRIPE_SECRET_KEY ausente' }

  try {
    const ids = new Set<string>()
    if (knownSub) ids.add(knownSub)
    // O perfil guarda UMA assinatura; o cliente pode ter outra (checkout
    // repetido, troca de plano mal reconciliada). Lista todas.
    if (customerId) {
      const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })
      for (const sub of subs.data) if (!DEAD_STATUSES.has(sub.status)) ids.add(sub.id)
    }

    const cancelled: string[] = []
    for (const id of Array.from(ids)) {
      try {
        const sub = await stripe.subscriptions.cancel(id)
        if (sub.status === 'canceled') cancelled.push(id)
      } catch (err) {
        // Já não existe do lado da Stripe: nada cobra. Qualquer outro erro para tudo.
        if ((err as { code?: string }).code === 'resource_missing') continue
        throw err
      }
    }
    return { ok: true, cancelled }
  } catch (err) {
    return { ok: false, reason: 'stripe_error', detail: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * O que não cai em cascata a partir de `auth.users`.
 *
 * As tabelas do usuário apontam para `auth.users`/`profiles` com
 * `ON DELETE CASCADE` (inventário das migrações em 2026-11-01). Ficam de fora:
 * arquivos do Storage, que não são linhas, e `error_log.user_id`, que não tem
 * FK de propósito — o defeito continua útil, a pessoa não precisa continuar
 * ligada a ele.
 *
 * Falha aqui não impede a exclusão: é limpeza de resíduo, e cada erro volta
 * na lista para ser registrado.
 */
export async function removeNonCascadingData(uid: string, admin: SupabaseClient): Promise<string[]> {
  const problems: string[] = []

  const bucket = admin.storage.from('profile-photos')
  const { data: files, error: listError } = await bucket.list(uid, { limit: 100 })
  if (listError) problems.push(`storage.list: ${listError.message}`)
  else if (files?.length) {
    const { error: removeError } = await bucket.remove(files.map(f => `${uid}/${f.name}`))
    if (removeError) problems.push(`storage.remove: ${removeError.message}`)
  }

  const { error: anonError } = await admin.from('error_log').update({ user_id: null }).eq('user_id', uid)
  if (anonError) problems.push(`error_log: ${anonError.message}`)

  return problems
}
