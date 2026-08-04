/**
 * Envio de push, num lugar só (D-119).
 *
 * O padrão estava copiado em quatro rotas, e a cópia já custou caro: a coluna é
 * `user_id`, não `profile_id`, e onde alguém escreveu errado o push falhava
 * **em silêncio** — a rota respondia sucesso e o telefone nunca tocava.
 *
 * Aqui a resposta é sempre contável: quantos foram, quantos falharam, quantos
 * não tinham aparelho. Quem chama decide o que dizer ao usuário, mas não tem
 * como confundir "não enviei" com "enviei".
 */

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

export type PushPayload = { title: string; body: string; url?: string }

export type PushResult = {
  sent: number
  failed: number
  /** Destinatários sem nenhum aparelho registrado. */
  noDevice: number
  /** Assinaturas mortas que foram removidas do banco. */
  pruned: number
  reason?: 'vapid_not_configured'
}

/**
 * Uma assinatura pode morrer sem avisar: o usuário desinstala o app, limpa o
 * navegador, troca de aparelho. O serviço de push responde 404 ou 410, e manter
 * a linha só garante que toda tentativa futura vai falhar de novo.
 */
const MORTA = new Set([404, 410])

export async function sendPush(
  admin: SupabaseClient,
  userIds: string[],
  payload: PushPayload,
): Promise<PushResult> {
  const vazio: PushResult = { sent: 0, failed: 0, noDevice: 0, pruned: 0 }

  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privada = process.env.VAPID_PRIVATE_KEY
  const assunto = process.env.VAPID_SUBJECT
  if (!publica || !privada || !assunto) {
    return { ...vazio, reason: 'vapid_not_configured' }
  }

  const unicos = Array.from(new Set(userIds.filter(Boolean)))
  if (!unicos.length) return vazio

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', unicos)

  const linhas = (subs ?? []) as Array<{ endpoint: string; p256dh: string; auth: string; user_id: string }>
  const comAparelho = new Set(linhas.map(l => l.user_id))
  const noDevice = unicos.filter(id => !comAparelho.has(id)).length
  if (!linhas.length) return { ...vazio, noDevice }

  webpush.setVapidDetails(assunto, publica, privada)
  const corpo = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url ?? '/dashboard' })

  const mortas: string[] = []
  const resultados = await Promise.allSettled(
    linhas.map(async l => {
      try {
        await webpush.sendNotification({ endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, corpo)
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status && MORTA.has(status)) mortas.push(l.endpoint)
        throw e
      }
    }),
  )

  if (mortas.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', mortas)
  }

  return {
    sent: resultados.filter(r => r.status === 'fulfilled').length,
    failed: resultados.filter(r => r.status === 'rejected').length,
    noDevice,
    pruned: mortas.length,
  }
}
