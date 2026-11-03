/**
 * O link e a mensagem de convite do círculo (D-112).
 *
 * Moram aqui, e não dentro de `InviteShare`, porque a tela Cadastro passou a
 * enviar convite pessoa a pessoa (HOUSEHOLD-FIX-001 §3.4). Duas cópias da
 * mesma frase acabariam dizendo coisas diferentes.
 */

export function inviteUrl(origin: string, inviteCode: string, withFamily = false): string {
  return `${origin}/convite/${inviteCode}${withFamily ? '?intima=1' : ''}`
}

export function inviteMessage(circleName: string, url: string, pt: boolean): string {
  return pt
    ? `Entre no meu círculo "${circleName}" no EOS — é onde a gente se encontra se algo acontecer.\n\n${url}`
    : `Join my circle "${circleName}" on EOS — it is where we find each other if something happens.\n\n${url}`
}

export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'manual' | 'blocked'

/**
 * Compartilha pelo menu nativo (WhatsApp) ou copia.
 *
 *   shared     o menu nativo concluiu — conta como enviado (regra 7)
 *   cancelled  a pessoa fechou o menu — nada muda (E10)
 *   copied     sem menu nativo: o texto foi para a área de transferência (E11)
 *   manual     nem isso: a tela mostra o link para copiar à mão
 *   blocked    o navegador recusou abrir o menu sem um toque recente — acontece
 *              quando antes houve uma espera de rede (criar o círculo)
 */
export async function shareInvite(text: string, title: string): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (e) {
      const nome = (e as { name?: string })?.name
      if (nome === 'NotAllowedError') return 'blocked'
      return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'manual'
  }
}
