'use client'

/**
 * Convidadas, ainda não entraram — agora com o que fazer com cada uma
 * (HOUSEHOLD-FIX-001 §3.4).
 *
 * Esta lista existia sem NENHUM botão. A beta tester de 2026-11-03 ficou com
 * quatro convites para duas pessoas e escreveu "não achei aonde eu consigo
 * apagar". O servidor já sabia descartar; nenhuma tela chamava.
 *
 * Cada convite tem as próprias ações, na própria linha:
 *
 *   Enviar convite  → menu nativo (WhatsApp) com o link do círculo. Sem círculo
 *                     e com plano Família, cria o círculo no mesmo toque (D1).
 *   Corrigir nome   → edita ali mesmo, com o aviso de nome parecido (§3.2).
 *   Remover         → um toque, com "Desfazer" por 8 s (quem mostra a barra é
 *                     a tela, via `onRemoved`).
 */

import { useRef, useState } from 'react'
import { Pill } from './primitives'
import { findSimilar, type NamedPerson } from '@/lib/household-names'
import { inviteMessage, inviteUrl, shareInvite } from '@/lib/invite-link'

export type Invite = { id: string; name: string; status: 'pending' | 'sent'; sent_at: string | null }
export type CircleInfo = { id: string; name: string; inviteCode: string }

const T = {
  pt: {
    label: 'Convidadas, ainda não entraram',
    why: 'Elas contam na casa, mas só recebem alerta e aparecem no mapa depois de entrar com o link. Não precisamos do número delas.',
    notSent: 'Convite ainda não enviado',
    sentOn: (d: string) => `Convite enviado em ${d}`,
    send: 'Enviar convite',
    resend: 'Reenviar',
    fix: 'Corrigir nome',
    remove: 'Remover',
    save: 'Salvar nome',
    cancel: 'Cancelar',
    creating: 'Criando o círculo…',
    copied: 'Convite copiado. Cole no WhatsApp e depois toque em "Já enviei".',
    manual: 'Copie este link e mande pelo WhatsApp:',
    sentBtn: 'Já enviei',
    blocked: 'Círculo criado. Toque em "Enviar convite" de novo para abrir o WhatsApp.',
    needPlan: 'Para convidar, a casa precisa de um círculo, e criar um círculo faz parte do plano Família. O nome fica guardado aqui.',
    seePlans: 'Ver planos',
    createFailed: 'Não consegui criar o círculo. Tente de novo.',
    failed: 'Não deu certo. Tente de novo.',
    taken: 'Já existe um convite com esse nome.',
    same: (n: string) => `Já existe "${n}" na casa. É a mesma pessoa?`,
    sameYes: 'É a mesma, remover este',
    sameNo: 'É outra, salvar o nome',
    circleName: (first: string) => (first ? `Casa de ${first}` : 'Nossa casa'),
  },
  en: {
    label: 'Invited, not in yet',
    why: 'They count in the household, but only get alerts and appear on the map after joining with the link. We don’t need their number.',
    notSent: 'Invite not sent yet',
    sentOn: (d: string) => `Invite sent on ${d}`,
    send: 'Send invite',
    resend: 'Resend',
    fix: 'Fix name',
    remove: 'Remove',
    save: 'Save name',
    cancel: 'Cancel',
    creating: 'Creating the circle…',
    copied: 'Invite copied. Paste it in WhatsApp, then tap "I sent it".',
    manual: 'Copy this link and send it by WhatsApp:',
    sentBtn: 'I sent it',
    blocked: 'Circle created. Tap "Send invite" again to open WhatsApp.',
    needPlan: 'To invite, the household needs a circle, and creating a circle is part of the Family plan. The name stays saved here.',
    seePlans: 'See plans',
    createFailed: 'Could not create the circle. Try again.',
    failed: 'That did not work. Try again.',
    taken: 'There is already an invite with that name.',
    same: (n: string) => `"${n}" is already in the household. Is it the same person?`,
    sameYes: 'Same person, remove this one',
    sameNo: 'Different person, save name',
    circleName: (first: string) => (first ? `${first}’s home` : 'Our home'),
  },
} as const

type Nota = { kind: 'ok' | 'warn' | 'manual'; text: string; url?: string; askSent?: boolean }

export default function HouseholdInvites({
  invites,
  others,
  circle,
  canCreateCircle,
  pt,
  onCircleCreated,
  onChanged,
  onRemoved,
}: {
  invites: Invite[]
  /** Todo o resto da casa, para o aviso de nome parecido ao corrigir. */
  others: NamedPerson[]
  circle: CircleInfo | null
  canCreateCircle: boolean
  pt: boolean
  onCircleCreated: (c: CircleInfo) => void
  /** Algo mudou no servidor: recarregar a lista. */
  onChanged: () => void
  /** Removido: a tela mostra "Desfazer" e chama `restore` se pedido. */
  onRemoved: (label: string, restore: () => Promise<void>) => void
}) {
  const c = T[pt ? 'pt' : 'en']
  const [notas, setNotas] = useState<Record<string, Nota>>({})
  const [editando, setEditando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [parecido, setParecido] = useState<{ id: string; with: string } | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  /** Trava contra dois toques criando dois círculos (E18) — ref, não estado. */
  const criando = useRef(false)

  const nota = (id: string, n: Nota | null) =>
    setNotas(atual => {
      const proximo = { ...atual }
      if (n) proximo[id] = n
      else delete proximo[id]
      return proximo
    })

  const patch = (body: Record<string, unknown>) =>
    fetch('/api/household/address', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

  const marcarEnviado = async (i: Invite) => {
    const r = await patch({ id: i.id, status: 'sent' }).catch(() => null)
    if (r?.ok) { nota(i.id, null); onChanged() }
    else nota(i.id, { kind: 'warn', text: c.failed })
  }

  /** D1 = (a): sem círculo e com plano Família, o toque cria o círculo. */
  const garantirCirculo = async (): Promise<CircleInfo | null> => {
    if (circle) return circle
    if (criando.current) return null
    criando.current = true
    try {
      const ficha = await fetch('/api/profile/ficha').then(r => (r.ok ? r.json() : null)).catch(() => null)
      const primeiro = String(ficha?.ficha?.name ?? '').trim().split(/\s+/)[0] ?? ''
      const r = await fetch('/api/circles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: c.circleName(primeiro) }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.circle?.id) return null
      const novo: CircleInfo = { id: j.circle.id, name: c.circleName(primeiro), inviteCode: j.circle.invite_code }
      onCircleCreated(novo)
      return novo
    } catch {
      return null
    } finally {
      criando.current = false
    }
  }

  const enviar = async (i: Invite) => {
    if (ocupado) return
    nota(i.id, null)
    if (!circle && !canCreateCircle) {
      nota(i.id, { kind: 'warn', text: c.needPlan, url: '/mais' })
      return
    }
    setOcupado(i.id)
    try {
      const criouAgora = !circle
      if (criouAgora) nota(i.id, { kind: 'ok', text: c.creating })
      const circ = await garantirCirculo()
      if (!circ) {
        // E17: o servidor desfaz o círculo pela metade; o convite segue pendente.
        nota(i.id, { kind: 'warn', text: c.createFailed })
        return
      }
      const url = inviteUrl(window.location.origin, circ.inviteCode)
      const resultado = await shareInvite(inviteMessage(circ.name, url, pt), `EOS · ${circ.name}`)
      if (resultado === 'shared') {
        await marcarEnviado(i)
      } else if (resultado === 'cancelled') {
        nota(i.id, null)
      } else if (resultado === 'copied') {
        nota(i.id, { kind: 'ok', text: c.copied, askSent: true })
      } else if (resultado === 'blocked') {
        nota(i.id, { kind: 'ok', text: c.blocked })
      } else {
        nota(i.id, { kind: 'manual', text: c.manual, url, askSent: true })
      }
      if (criouAgora) onChanged()
    } finally {
      setOcupado(null)
    }
  }

  const remover = async (i: Invite) => {
    const r = await patch({ id: i.id, status: 'dismissed' }).catch(() => null)
    if (!r?.ok) {
      // E13: outra aba já mexeu — recarrega sem alarde.
      if (r?.status === 404) onChanged()
      else nota(i.id, { kind: 'warn', text: c.failed })
      return
    }
    onChanged()
    onRemoved(`${i.name}`, async () => {
      const volta = await patch({ id: i.id, status: i.status, restore: true }).catch(() => null)
      if (volta?.status === 409) throw new Error(c.taken)
      if (!volta?.ok) throw new Error(c.failed)
      onChanged()
    })
  }

  const salvarNome = async (i: Invite, confirmado = false) => {
    const novo = rascunho.trim()
    if (!novo || novo === i.name) { setEditando(null); return }
    if (!confirmado) {
      const outros = [...others, ...invites.filter(x => x.id !== i.id).map(x => ({ kind: 'invite' as const, id: x.id, name: x.name }))]
      const iguais = findSimilar(novo, outros)
      if (iguais.length) { setParecido({ id: i.id, with: iguais[0].name }); return }
    }
    setParecido(null)
    const r = await patch({ id: i.id, name: novo }).catch(() => null)
    if (r?.status === 409) { nota(i.id, { kind: 'warn', text: c.taken }); return }
    if (!r?.ok) { nota(i.id, { kind: 'warn', text: c.failed }); return }
    setEditando(null)
    nota(i.id, null)
    onChanged()
  }

  if (!invites.length) return null

  const data = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString(pt ? 'pt-BR' : 'en-US', { day: '2-digit', month: '2-digit' })
  }

  return (
    <section className="roster-invites">
      <p className="t-caps ink-3 roster-invites-label">{c.label}</p>
      <p className="t-foot ink-2">{c.why}</p>

      {invites.map(i => {
        const n = notas[i.id]
        const emEdicao = editando === i.id
        return (
          <article key={i.id} className="wv2-card roster-person roster-invite">
            {emEdicao ? (
              <div className="field">
                <input
                  className="roster-input"
                  type="text"
                  value={rascunho}
                  onChange={e => { setRascunho(e.target.value); setParecido(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void salvarNome(i) } }}
                  autoFocus
                  aria-label={c.fix}
                />
                {parecido?.id === i.id ? (
                  <div className="roster-ask">
                    <strong className="t-sub">{c.same(parecido.with)}</strong>
                    <div className="roster-actions">
                      <Pill primary onClick={() => { setParecido(null); setEditando(null); void remover(i) }}>{c.sameYes}</Pill>
                      <Pill onClick={() => void salvarNome(i, true)}>{c.sameNo}</Pill>
                    </div>
                  </div>
                ) : (
                  <div className="roster-actions">
                    <Pill primary onClick={() => void salvarNome(i)} disabled={!rascunho.trim()}>{c.save}</Pill>
                    <Pill onClick={() => { setEditando(null); setParecido(null) }}>{c.cancel}</Pill>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="id">
                  <strong className="t-title2">{i.name}</strong>
                  <em className={`t-foot ${i.status === 'sent' ? 'ok' : 'warn'}`}>
                    {i.status === 'sent' ? c.sentOn(data(i.sent_at)) : c.notSent}
                  </em>
                </div>
                <div className="roster-actions">
                  <Pill primary={i.status !== 'sent'} onClick={() => void enviar(i)} disabled={ocupado !== null}>
                    {i.status === 'sent' ? c.resend : c.send}
                  </Pill>
                  <Pill onClick={() => { setEditando(i.id); setRascunho(i.name); setParecido(null); nota(i.id, null) }}>
                    {c.fix}
                  </Pill>
                  <button type="button" className="roster-danger-soft" onClick={() => void remover(i)}>
                    {c.remove}
                  </button>
                </div>
              </>
            )}

            {n && (
              <div className="roster-invite-note" role="status">
                <p className={`t-foot ${n.kind === 'warn' ? 'warn' : 'ink-2'}`}>{n.text}</p>
                {n.kind === 'manual' && n.url && <code className="roster-link">{n.url}</code>}
                {n.kind === 'warn' && n.url && <a className="wv2-pill" href={n.url}>{c.seePlans}</a>}
                {n.askSent && <Pill onClick={() => void marcarEnviado(i)}>{c.sentBtn}</Pill>}
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}
