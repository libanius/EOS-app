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
 *
 * ── Dois transportes, uma porta (D-228 §4) ────────────────────────────────
 *
 * Desde a casca nativa existem dois caminhos até a tela de bloqueio:
 *
 *  · **Web Push** — navegador e PWA instalada. Payload cifrado ponta a ponta
 *    com as chaves guardadas em `push_subscriptions`;
 *  · **Nativo** — APNs no iOS, FCM no Android, tokens em `push_devices`. É o
 *    ÚNICO caminho dentro do app de loja: o WebView não implementa `PushManager`
 *    em nenhuma das duas plataformas, então lá o Web Push não degrada — ele
 *    simplesmente não existe.
 *
 * Nenhuma das quatro rotas que enviam push precisou mudar, e é esse o ponto.
 */

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarParaAparelhos, type NativeDevice } from '@/lib/push-native'

export type PushPayload = { title: string; body: string; url?: string }

export type PushResult = {
  sent: number
  failed: number
  /** Destinatários sem NENHUM aparelho registrado — nem navegador, nem nativo. */
  noDevice: number
  /** Assinaturas e tokens mortos que foram removidos do banco. */
  pruned: number
  /**
   * Por que um transporte não saiu.
   *
   * Deixou de ser uma string só quando passaram a existir dois transportes: com
   * VAPID ausente e APNs configurado, metade sai e metade não, e um campo único
   * teria de escolher qual verdade contar.
   */
  reason?: 'vapid_not_configured'
  nativeNotConfigured?: Array<'ios' | 'android'>
  /** Quebra por transporte. Útil quando só um dos dois está quebrado. */
  breakdown?: { web: { sent: number; failed: number }; native: { sent: number; failed: number } }
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

  const unicos = Array.from(new Set(userIds.filter(Boolean)))
  if (!unicos.length) return vazio

  /*
   * Os dois destinos são lidos ANTES de qualquer envio.
   *
   * `noDevice` tem de olhar as duas tabelas: quem instalou o app da loja e
   * nunca ligou o push do navegador aparecia como "sem aparelho" para sempre —
   * exatamente a confusão entre "não enviei" e "enviei" que esta função existe
   * para impedir.
   */
  const [assinaturas, aparelhos] = await Promise.all([
    admin.from('push_subscriptions').select('endpoint, p256dh, auth, user_id').in('user_id', unicos),
    admin.from('push_devices').select('token, platform, user_id').in('user_id', unicos),
  ])

  const linhas = (assinaturas.data ?? []) as Array<{
    endpoint: string
    p256dh: string
    auth: string
    user_id: string
  }>

  /*
   * `push_devices` pode não existir ainda — a migração de MOB-T03 é aplicada à
   * mão pelo dono no SQL Editor, como as anteriores. `42P01` (tabela ausente) é
   * degradação, nunca erro: o Web Push continua saindo inteiro.
   */
  if (aparelhos.error && aparelhos.error.code !== '42P01') {
    console.error('[EOS] leitura de push_devices falhou:', aparelhos.error.message)
  }
  const devices = (aparelhos.data ?? []) as Array<NativeDevice & { user_id: string }>

  const comAparelho = new Set<string>([
    ...linhas.map(l => l.user_id),
    ...devices.map(d => d.user_id),
  ])
  const noDevice = unicos.filter(id => !comAparelho.has(id)).length

  // ── Web Push ─────────────────────────────────────────────────────────────
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privada = process.env.VAPID_PRIVATE_KEY
  const assunto = process.env.VAPID_SUBJECT
  const vapidOk = Boolean(publica && privada && assunto)

  let webSent = 0
  let webFailed = 0
  const mortas: string[] = []

  if (vapidOk && linhas.length) {
    webpush.setVapidDetails(assunto!, publica!, privada!)
    const corpo = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/dashboard',
    })

    const resultados = await Promise.allSettled(
      linhas.map(async l => {
        try {
          await webpush.sendNotification(
            { endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } },
            corpo,
          )
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode
          if (status && MORTA.has(status)) mortas.push(l.endpoint)
          throw e
        }
      }),
    )
    webSent = resultados.filter(r => r.status === 'fulfilled').length
    webFailed = resultados.filter(r => r.status === 'rejected').length
  } else if (!vapidOk) {
    // Sem VAPID as assinaturas existentes não recebem — e isso é falha contável,
    // não ausência de destinatário.
    webFailed = linhas.length
  }

  // ── Push nativo ──────────────────────────────────────────────────────────
  const nativo = await enviarParaAparelhos(
    devices.map(d => ({ token: d.token, platform: d.platform })),
    payload,
  )

  // ── Limpeza ──────────────────────────────────────────────────────────────
  if (mortas.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', mortas)
  }
  if (nativo.dead.length) {
    await admin.from('push_devices').delete().in('token', nativo.dead)
  }

  return {
    sent: webSent + nativo.sent,
    failed: webFailed + nativo.failed,
    noDevice,
    pruned: mortas.length + nativo.dead.length,
    ...(vapidOk ? {} : { reason: 'vapid_not_configured' as const }),
    ...(nativo.notConfigured.length ? { nativeNotConfigured: nativo.notConfigured } : {}),
    breakdown: {
      web: { sent: webSent, failed: webFailed },
      native: { sent: nativo.sent, failed: nativo.failed },
    },
  }
}
