'use client'

/**
 * Compartilhar o convite do círculo (D-112).
 *
 * Ditar um código de seis letras e esperar a pessoa digitar certo é o gesto mais
 * frágil do produto: erra-se a letra, erra-se a tela, e o convite morre no
 * caminho. Um link resolve os três de uma vez.
 *
 * Duas decisões de comportamento:
 *
 *  - **Usa o compartilhamento nativo quando existe.** No celular, `navigator.share`
 *    abre o WhatsApp que a família já usa. Sem ele — desktop —, copia para a área
 *    de transferência e diz que copiou. Nunca fica sem resposta ao toque.
 *  - **Família íntima é uma escolha explícita e desmarcada por padrão.** Marcar
 *    não concede nada: ao aprovar, a pessoa recebe o pedido e decide na conta
 *    dela. Mas ainda assim é uma pergunta sobre a ficha médica de alguém, e uma
 *    caixa pré-marcada seria o app decidindo por quem convida.
 */

import { useMemo, useState } from 'react'

export default function InviteShare({
  circleId,
  circleName,
  inviteCode,
  pt,
  compact = false,
}: {
  circleId?: string
  circleName: string
  inviteCode: string
  pt: boolean
  /**
   * Só o botão, sem a opção de Família íntima.
   *
   * NÃO usar nas telas onde a pessoa vai de fato convidar: eu comecei com
   * `compact` em Círculos e o resultado foi um convite que nunca conseguia
   * incluir a Família íntima — metade da feature invisível, sem nenhum aviso.
   * Existe para encaixes futuros realmente apertados.
   */
  compact?: boolean
}) {
  const [withFamily, setWithFamily] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const url = useMemo(() => {
    // `window.location.origin` e não uma env: o link precisa apontar para o
    // mesmo domínio em que a pessoa está, inclusive em preview.
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/convite/${inviteCode}${withFamily ? '?intima=1' : ''}`
  }, [inviteCode, withFamily])

  const message = pt
    ? `Entre no meu círculo "${circleName}" no EOS — é onde a gente se encontra se algo acontecer.\n\n${url}`
    : `Join my circle "${circleName}" on EOS — it is where we find each other if something happens.\n\n${url}`

  const share = async () => {
    setNote(null)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `EOS · ${circleName}`, text: message })
        return
      } catch {
        // Cancelar o menu nativo não é erro e não merece mensagem nenhuma.
        return
      }
    }
    try {
      await navigator.clipboard.writeText(message)
      setNote(pt ? 'Convite copiado. Cole no WhatsApp.' : 'Invite copied. Paste it in WhatsApp.')
    } catch {
      // Sem área de transferência (contexto inseguro, permissão negada), o link
      // fica na tela para seleção manual — nunca um toque sem resposta.
      setNote(url)
    }
  }

  return (
    <div className="invite-share" data-circle={circleId}>
      <button type="button" className="invite-share-btn" onClick={share}>
        {pt ? 'Convidar por link' : 'Invite by link'}
      </button>

      {!compact && (
        <label className="invite-share-family">
          <input
            type="checkbox"
            checked={withFamily}
            onChange={e => { setWithFamily(e.target.checked); setNote(null) }}
          />
          <span>
            {/*
              D-124: o rótulo dizia "Família íntima" para o que é ACESSO À
              FICHA MÉDICA. O dono leu como "mora na mesma casa", e tinha
              razão — era o nome que estava errado, não a leitura dele.
            */}
            {pt ? 'Pedir acesso à ficha médica dela' : 'Ask for access to their medical record'}
            <em>
              {pt
                ? 'Ela ainda precisa aceitar na conta dela — o link só faz o pedido. Isto não tem relação com morar junto.'
                : 'They still have to accept in their own account — the link only asks. This is unrelated to living together.'}
            </em>
          </span>
        </label>
      )}

      {note && <p className="invite-share-note" role="status">{note}</p>}
    </div>
  )
}
