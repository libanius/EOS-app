'use client'

/**
 * /convite/[code] — o convite que se envia por WhatsApp (D-112).
 *
 * Antes, convidar alguém era ditar um código de seis letras e torcer para a
 * pessoa digitar certo, achar a tela e colar. Um link faz o mesmo trabalho sem
 * nenhuma dessas três chances de erro.
 *
 * A rota é PROTEGIDA de propósito. Quem clica sem conta cai no login com
 * `redirectTo` e volta para cá — o middleware já faz isso. A alternativa seria
 * uma página pública que revela o nome do círculo antes do login, e não há
 * motivo para vazar isso a quem quer que receba o link encaminhado.
 *
 * O parâmetro `?intima=1` pede também a Família íntima. Ele **não concede
 * nada**: na aprovação, o convite fica pendente para a própria pessoa aceitar
 * (D-112). Um link pode fazer a pergunta; nunca responder por alguém.
 */

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'

type Outcome =
  | { kind: 'working' }
  | { kind: 'pending'; circle: string; intima: boolean; migration: boolean }
  | { kind: 'member'; circle: string }
  | { kind: 'error'; message: string }

export default function ConvitePage() {
  const params = useParams<{ code: string }>()
  const search = useSearchParams()
  const { language } = useLanguage()
  const pt = language === 'pt'
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'working' })

  const wantsFamily = search.get('intima') === '1'

  useEffect(() => {
    const code = (params?.code ?? '').toUpperCase()
    if (code.length !== 6) {
      setOutcome({ kind: 'error', message: pt ? 'Este link está incompleto.' : 'This link is incomplete.' })
      return
    }
    let cancelled = false
    fetch('/api/circles/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: code, wantsFamilyAccess: wantsFamily }),
    })
      .then(async r => ({ ok: r.ok, data: await r.json().catch(() => null) }))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (!ok) {
          setOutcome({
            kind: 'error',
            message: data?.error === 'Circle not found'
              ? (pt ? 'Este convite não existe mais.' : 'This invite no longer exists.')
              : data?.error ?? (pt ? 'Não foi possível entrar.' : 'Could not join.'),
          })
          return
        }
        if (data?.status === 'member') {
          setOutcome({ kind: 'member', circle: data.circle?.name ?? '' })
          return
        }
        setOutcome({
          kind: 'pending',
          circle: data?.circle?.name ?? '',
          intima: wantsFamily,
          migration: data?.familyAccessPending === 'migration',
        })
      })
      .catch(() => {
        if (!cancelled) setOutcome({ kind: 'error', message: pt ? 'Sem conexão agora.' : 'No connection right now.' })
      })
    return () => { cancelled = true }
  }, [params?.code, wantsFamily, pt])

  return (
    <main className="wv2 wv2-invite-page">
      <div className="invite-box">
        {outcome.kind === 'working' && (
          <p className="t-body ink-2">{pt ? 'Entrando…' : 'Joining…'}</p>
        )}

        {outcome.kind === 'pending' && (
          <>
            <p className="t-caps ink-3">{pt ? 'Convite' : 'Invite'}</p>
            <h1 className="t-title1">
              {pt ? `Pedido enviado para ${outcome.circle}` : `Request sent to ${outcome.circle}`}
            </h1>
            <p className="t-body ink-2">
              {pt
                ? 'Quem administra o círculo precisa aprovar. Você recebe um aviso assim que isso acontecer.'
                : 'A circle admin has to approve it. You will be notified as soon as that happens.'}
            </p>
            {outcome.intima && !outcome.migration && (
              <p className="t-body ink-2">
                {pt
                  ? 'O convite inclui a Família íntima. Quando você for aprovado, vai aparecer um pedido para você aceitar — só você pode liberar sua ficha.'
                  : 'The invite includes Intimate Family. Once approved, you will get a request to accept — only you can release your record.'}
              </p>
            )}
            {outcome.migration && (
              <p className="t-foot warn">
                {pt
                  ? 'A parte de Família íntima ainda não pôde ser registrada; quem convidou poderá enviá-la depois.'
                  : 'The Intimate Family part could not be recorded yet; whoever invited you can send it later.'}
              </p>
            )}
            <Link className="wv2-pill primary" href="/circles">{pt ? 'Ver meus círculos' : 'See my circles'}</Link>
          </>
        )}

        {outcome.kind === 'member' && (
          <>
            <p className="t-caps ink-3">{pt ? 'Convite' : 'Invite'}</p>
            <h1 className="t-title1">{pt ? 'Você já faz parte' : 'You are already in'}</h1>
            <p className="t-body ink-2">
              {pt ? `Nada a fazer: você já é membro de ${outcome.circle}.` : `Nothing to do: you are already a member of ${outcome.circle}.`}
            </p>
            <Link className="wv2-pill primary" href="/circles">{pt ? 'Ver meus círculos' : 'See my circles'}</Link>
          </>
        )}

        {outcome.kind === 'error' && (
          <>
            <p className="t-caps ink-3">{pt ? 'Convite' : 'Invite'}</p>
            <h1 className="t-title1">{pt ? 'Não deu para entrar' : 'Could not join'}</h1>
            <p className="t-body ink-2">{outcome.message}</p>
            <Link className="wv2-pill" href="/circles">{pt ? 'Ir para Círculos' : 'Go to Circles'}</Link>
          </>
        )}
      </div>
    </main>
  )
}
