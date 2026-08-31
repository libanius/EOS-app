/**
 * O leque nativo (D-228 §4).
 *
 * ── Por que este arquivo existe em vez de um refactor ─────────────────────
 *
 * A D-119 criou `sendPush()` como porta única, mas SETE lugares nunca migraram
 * e continuam falando com `web-push` direto — inclusive `lib/hazards/scan.ts`,
 * que é o caminho pelo qual o produto cumpre a sua promessa.
 *
 * Sem alcançar esses sete, o app das lojas seria o único lugar onde o EOS não
 * avisa de perigo. Reescrevê-los todos de uma vez, porém, significaria mexer no
 * código mais crítico do produto por causa de uma casca — e a cada um deles com
 * suas próprias regras de dedup, cooldown, horário de silêncio e log de
 * entrega.
 *
 * Então este módulo é ADITIVO: uma chamada de uma linha que cada lugar acrescenta
 * ao que já faz. Nada do comportamento existente muda; os aparelhos nativos
 * passam a receber o mesmo que os navegadores já recebem.
 *
 * A consolidação em `sendPush()` continua sendo dívida real, registrada como
 * MOB-T07 no roadmap. Este arquivo não a paga — ele impede que ela bloqueie o
 * lançamento nas lojas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarParaAparelhos, type NativeDevice, type NativePushPayload } from '@/lib/push-native'

export type FanoutNativo = {
  sent: number
  failed: number
  /** Tokens removidos por o provedor ter afirmado que não existem mais. */
  pruned: number
  /** `true` quando há aparelho nativo para este conjunto de usuários. */
  hadDevices: boolean
}

const VAZIO: FanoutNativo = { sent: 0, failed: 0, pruned: 0, hadDevices: false }

/**
 * Lê os aparelhos nativos destes usuários, envia, e remove o que morreu.
 *
 * **Nunca lança.** Todo chamador já enviou (ou vai enviar) por Web Push, e uma
 * exceção aqui derrubaria aquele caminho junto — o oposto do que se quer quando
 * é justamente um dos dois transportes que está com problema.
 */
export async function enviarNativoParaUsuarios(
  admin: SupabaseClient,
  userIds: string[],
  payload: NativePushPayload,
): Promise<FanoutNativo> {
  const unicos = Array.from(new Set(userIds.filter(Boolean)))
  if (!unicos.length) return VAZIO

  try {
    const { data, error } = await admin
      .from('push_devices')
      .select('token, platform')
      .in('user_id', unicos)

    /*
     * `42P01` é a tabela ainda não existir.
     *
     * As migrações deste projeto são aplicadas à mão pelo dono no SQL Editor, e
     * entre o deploy e a aplicação existe uma janela real. Nessa janela o Web
     * Push tem de continuar saindo inteiro — degradação, nunca erro. É a mesma
     * regra que a PREP-T04 fixou.
     */
    if (error) {
      if (error.code !== '42P01') {
        console.error('[EOS] leitura de push_devices falhou:', error.message)
      }
      return VAZIO
    }

    const devices = (data ?? []) as NativeDevice[]
    if (!devices.length) return VAZIO

    const r = await enviarParaAparelhos(devices, payload)

    if (r.dead.length) {
      await admin.from('push_devices').delete().in('token', r.dead)
    }
    if (r.notConfigured.length) {
      console.error(
        '[EOS] push nativo sem credencial para:',
        r.notConfigured.join(', '),
        '— aparelhos existem e não receberam',
      )
    }

    return { sent: r.sent, failed: r.failed, pruned: r.dead.length, hadDevices: true }
  } catch (e) {
    console.error('[EOS] leque nativo falhou:', e instanceof Error ? e.message : e)
    return VAZIO
  }
}
