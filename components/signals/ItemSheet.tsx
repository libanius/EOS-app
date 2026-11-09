'use client'

/**
 * A folha do item do Sinal (SIGNAL-002 §3.1, INVENTORY-001 §3.3–§3.4, INV-T04).
 *
 * Ter ou não ter: três respostas. "Tenho" cria o item no estoque da casa quando
 * ela ainda não tem (D-I1); com item na casa, a folha mostra quem cobre e cada
 * item abre a ficha do estoque (marca, modelo, lugar). "Ainda não tenho" com
 * item na casa pergunta quais remover — nada sai sem confirmação (E5).
 *
 * Água e comida: a lista do estoque da casa e "+ Adicionar". A quantidade se
 * muda no item, não aqui (§3.3; substitui o "quanto tem agora" do SIGNAL-002).
 *
 * Prévia do admin e Sinal arquivado: só leitura.
 */

import { useEffect, useRef, useState } from 'react'
import { MEALS_PER_PERSON_DAY, type ItemView, type ProtocolOption } from '@/lib/signals'
import ProtocolOptions from './ProtocolOptions'
import type { HouseAnswer, HouseItemState } from '@/lib/signal-house'
import { litersToGallons } from '@/lib/units'
import { mealsText, quantityText, type ApiItem } from '@/lib/stock-view'

type Lang = 'pt' | 'en'

const T = {
  pt: {
    close: 'Fechar',
    have: 'Tenho',
    need: 'Ainda não tenho',
    na: 'Não se aplica à minha casa',
    house: { met: 'A casa tem', needed: 'A casa ainda não tem', not_applicable: 'Não se aplica à casa', none: 'Ainda sem resposta' },
    by: (name: string, when: string) => `Respondido por ${name}, ${when}`,
    byMe: (when: string) => `Respondido por você, ${when}`,
    preview: 'Prévia: respostas não são gravadas.',
    archived: 'Sinal arquivado: respostas não são gravadas.',
    inStock: 'Na casa',
    tapToDetail: 'Toque num item para adicionar marca, modelo ou validade.',
    of: (n: string) => `de ${n}`,
    removeAsk: 'A casa tem este item no estoque. Quais saem?',
    removeYes: 'Remover selecionados',
    removeNo: 'Manter',
    removeNote: 'Nada sai sem você escolher. Sem remover, o Sinal continua mostrando que a casa tem.',
    houseToday: 'Casa hoje',
    meals: (m: number) => `${m} refeições`,
    add: '+ Adicionar ao estoque',
    changeQty: 'Para mudar a quantidade, toque no item.',
    noneYet: 'Nada no estoque ainda.',
    unknownHouse: 'Conte quem mora na casa primeiro.',
    family: 'Ir para Família',
    error: 'Não foi possível gravar. Tente de novo.',
  },
  en: {
    close: 'Close',
    have: 'I have it',
    need: 'Not yet',
    na: "Doesn't apply to my home",
    house: { met: 'Your home has it', needed: "Your home doesn't have it yet", not_applicable: "Doesn't apply to your home", none: 'No answer yet' },
    by: (name: string, when: string) => `Answered by ${name}, ${when}`,
    byMe: (when: string) => `Answered by you, ${when}`,
    preview: 'Preview: answers are not saved.',
    archived: 'Archived Signal: answers are not saved.',
    inStock: 'At home',
    tapToDetail: 'Tap an item to add brand, model or expiration.',
    of: (n: string) => `${n}'s`,
    removeAsk: 'Your home has this in stock. Which ones go?',
    removeYes: 'Remove selected',
    removeNo: 'Keep',
    removeNote: 'Nothing goes unless you choose. Without removing, the Signal keeps showing your home has it.',
    houseToday: 'Home today',
    meals: (m: number) => `${m} meals`,
    add: '+ Add to stock',
    changeQty: 'To change the quantity, tap the item.',
    noneYet: 'Nothing in stock yet.',
    unknownHouse: 'Count who lives in your home first.',
    family: 'Go to Family',
    error: 'Could not save. Try again.',
  },
}

function ago(iso: string, lang: Lang): string {
  const ms = Date.now() - new Date(iso).getTime()
  const rtf = new Intl.RelativeTimeFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { numeric: 'auto' })
  const min = Math.round(ms / 60000)
  if (min < 60) return rtf.format(-Math.max(0, min), 'minute')
  const h = Math.round(min / 60)
  if (h < 48) return rtf.format(-h, 'hour')
  return rtf.format(-Math.round(h / 24), 'day')
}

/** O que a resposta devolveu: quando a casa tem o item, a folha pergunta o que remover. */
export type AnswerResult = { confirmRemoval: ApiItem[] } | null

export type ItemSheetProps = {
  view: ItemView
  lang: Lang
  state: HouseItemState | null
  accounts: number
  me: string | null
  houseKnown: boolean
  /** Água (L) e comida (dia-pessoa) da casa inteira. */
  houseWaterLiters: number
  houseFoodPersonDays: number
  /** Itens da casa que cobrem este item do Sinal. */
  covering: ApiItem[]
  readOnly: 'preview' | 'archived' | null
  onClose: () => void
  /** Rejeita em caso de falha. */
  onAnswer: (answer: HouseAnswer) => Promise<AnswerResult>
  /** Remove os itens escolhidos e responde "Ainda não tenho". Rejeita em caso de falha. */
  onRemoveItems: (ids: string[]) => Promise<void>
  onOpenItem: (item: ApiItem) => void
  onAddItem: () => void
  onChooseOption?: (option: ProtocolOption) => void
}

export default function ItemSheet(p: ItemSheetProps) {
  const t = T[p.lang]
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [busy, setBusy] = useState<HouseAnswer | 'remove' | null>(null)
  const [error, setError] = useState(false)
  const [removal, setRemoval] = useState<ApiItem[] | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const kind = p.view.item.kind

  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const answer = async (a: HouseAnswer) => {
    setBusy(a); setError(false)
    try {
      const r = await p.onAnswer(a)
      if (r?.confirmRemoval?.length) {
        setRemoval(r.confirmRemoval)
        setChosen(new Set(r.confirmRemoval.map(i => i.id)))
      }
    } catch {
      setError(true)
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!chosen.size) return
    setBusy('remove'); setError(false)
    try {
      await p.onRemoveItems(Array.from(chosen))
      setRemoval(null)
    } catch {
      setError(true)
    } finally {
      setBusy(null)
    }
  }

  const s = p.state
  const has = p.covering.length > 0
  const houseLine = has ? t.house.met : s ? t.house[s.status === 'proposed' || s.status === 'met' ? 'needed' : s.status] : t.house.none
  const whoLine = !has && s && s.status !== 'met' && s.status !== 'proposed'
    ? s.by.isMe ? t.byMe(ago(s.updatedAt, p.lang)) : t.by(s.by.name || '—', ago(s.updatedAt, p.lang))
    : null
  const current: HouseAnswer | null = has ? 'have' : s?.status === 'needed' ? 'need' : s?.status === 'not_applicable' ? 'not_applicable' : null
  const disabled = Boolean(p.readOnly) || busy !== null

  const itemButton = (i: ApiItem) => {
    const sub = [
      [i.brand, i.model].filter(Boolean).join(' '),
      i.resourceKey === 'comida' ? mealsText(i.meals, p.lang) : null,
      p.accounts > 1 && p.me && i.profileId !== p.me ? t.of(i.ownerName || '—') : null,
    ].filter(Boolean).join(' · ')
    return (
      <button key={i.id} type="button" className="sg-stock-item" disabled={Boolean(p.readOnly)} onClick={() => p.onOpenItem(i)}>
        <span className="sg-stock-main">
          <strong>{i.label}</strong>
          {sub && <span className="sg-note">{sub}</span>}
        </span>
        <span className="sg-stock-qty">{quantityText(i, p.lang)}</span>
      </button>
    )
  }

  return (
    <div className="sg-sheet-wrap" onClick={p.onClose}>
      <div className="sg-sheet" role="dialog" aria-modal="true" aria-labelledby="sg-sheet-title" onClick={e => e.stopPropagation()}>
        <div className="sg-sheet-grip" aria-hidden="true" />
        <h2 id="sg-sheet-title" ref={titleRef} tabIndex={-1}>{p.view.item.label[p.lang]}</h2>
        {p.view.item.hint && <p className="sg-muted">{p.view.item.hint[p.lang]}</p>}

        {p.readOnly && <p className="sg-sheet-note">{p.readOnly === 'preview' ? t.preview : t.archived}</p>}
        {p.view.item.options?.length && p.onChooseOption ? <ProtocolOptions options={p.view.item.options} lang={p.lang}
          readOnly={Boolean(p.readOnly) || !p.houseKnown} onHave={p.onChooseOption} /> : null}

        {kind === 'PRESENCE' ? (
          <>
            <div className="sg-sheet-state">
              <strong>{houseLine}</strong>
              {whoLine && <span className="sg-note">{whoLine}</span>}
            </div>
            {has && (
              <div className="sg-stack" style={{ gap: 8 }}>
                <span className="sg-label">{t.inStock}</span>
                {p.covering.map(itemButton)}
                {!p.readOnly && <span className="sg-note">{t.tapToDetail}</span>}
              </div>
            )}
            {removal ? (
              <div className="sg-remove" role="group" aria-label={t.removeAsk}>
                <strong>{t.removeAsk}</strong>
                {removal.map(i => (
                  <label key={i.id} className="sg-check">
                    <input type="checkbox" checked={chosen.has(i.id)} disabled={busy !== null}
                      onChange={e => setChosen(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(i.id)
                        else next.delete(i.id)
                        return next
                      })} />
                    <span>{i.label}{i.brand || i.model ? ` · ${[i.brand, i.model].filter(Boolean).join(' ')}` : ''}</span>
                  </label>
                ))}
                <span className="sg-note">{t.removeNote}</span>
                <button type="button" className="sg-btn block" disabled={busy !== null || !chosen.size} onClick={() => void remove()}>
                  {busy === 'remove' ? '…' : t.removeYes}
                </button>
                <button type="button" className="sg-btn block" disabled={busy !== null} onClick={() => setRemoval(null)}>{t.removeNo}</button>
              </div>
            ) : (
              <div className="sg-stack" style={{ gap: 10 }}>
                {([['have', t.have], ['need', t.need], ['not_applicable', t.na]] as Array<[HouseAnswer, string]>).map(([a, label]) => (
                  <button
                    key={a}
                    type="button"
                    className={`sg-btn block sg-answer ${a === 'have' ? 'primary' : ''}`}
                    aria-pressed={current === a}
                    disabled={disabled}
                    onClick={() => void answer(a)}
                  >
                    {busy === a ? '…' : label}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : !p.houseKnown ? (
          <div className="sg-stack" style={{ gap: 10 }}>
            <p>{t.unknownHouse}</p>
            <a className="sg-btn block" href="/family">{t.family}</a>
          </div>
        ) : (
          <div className="sg-stack" style={{ gap: 10 }}>
            <div className="sg-sheet-state">
              <span className="sg-label">{t.houseToday}</span>
              <strong>
                {kind === 'ENGINE_WATER'
                  ? `${Math.round(p.houseWaterLiters)} L (${Math.round(litersToGallons(p.houseWaterLiters) * 10) / 10} gal)`
                  : t.meals(Math.round(p.houseFoodPersonDays * MEALS_PER_PERSON_DAY))}
              </strong>
            </div>
            {has ? p.covering.map(itemButton) : <p className="sg-muted">{t.noneYet}</p>}
            {has && !p.readOnly && <span className="sg-note">{t.changeQty}</span>}
            {!p.readOnly && <button type="button" className="sg-btn primary block" onClick={p.onAddItem}>{t.add}</button>}
          </div>
        )}

        {error && <p className="sg-sheet-error" role="alert">{t.error}</p>}
        <button type="button" className="sg-btn block" onClick={p.onClose}>{t.close}</button>
      </div>
    </div>
  )
}
