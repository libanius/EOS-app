'use client'

/**
 * A folha do item do Sinal (SIGNAL-002 §3.1–§3.3, §6).
 *
 * Ter ou não ter: três respostas, gravadas na linha de base da minha conta.
 * Água e comida: "quanto tem agora", gravado no meu inventário (substitui).
 * Prévia do admin e Sinal arquivado: só leitura.
 */

import { useEffect, useRef, useState } from 'react'
import { MEALS_PER_PERSON_DAY, type ItemView } from '@/lib/signals'
import type { HouseAnswer, HouseItemState } from '@/lib/signal-house'
import { gallonsToLiters, litersToGallons } from '@/lib/units'

type Lang = 'pt' | 'en'

const T = {
  pt: {
    close: 'Fechar',
    have: 'Tenho',
    need: 'Ainda não tenho',
    na: 'Não se aplica à minha casa',
    house: { met: 'A casa tem', needed: 'A casa ainda não tem', not_applicable: 'Não se aplica à casa', none: 'Ainda sem resposta' },
    by: (name: string, when: string) => `Marcado por ${name}, ${when}`,
    byMe: (when: string) => `Marcado por você, ${when}`,
    viaInventory: 'Registrado no inventário da casa',
    preview: 'Prévia: respostas não são gravadas.',
    archived: 'Sinal arquivado: respostas não são gravadas.',
    houseWater: 'Casa hoje',
    yourWater: 'O seu registro: quanta água você tem guardada agora',
    yourWaterOne: 'Quanta água a casa tem guardada agora',
    houseFood: 'Casa hoje',
    yourFood: 'Para quantos dias a comida que você guarda alimenta quem você cobre?',
    yourFoodOne: 'Para quantos dias a comida guardada alimenta a casa?',
    days: 'dias',
    meals: (m: number) => `= ${m} refeições`,
    save: 'Salvar',
    saving: 'Salvando…',
    replaces: 'Substitui o valor anterior. Não soma.',
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
    by: (name: string, when: string) => `Marked by ${name}, ${when}`,
    byMe: (when: string) => `Marked by you, ${when}`,
    viaInventory: 'Recorded in your home inventory',
    preview: 'Preview: answers are not saved.',
    archived: 'Archived Signal: answers are not saved.',
    houseWater: 'Home today',
    yourWater: 'Your record: how much water you have stored now',
    yourWaterOne: 'How much water your home has stored now',
    houseFood: 'Home today',
    yourFood: 'How many days does the food you keep feed the people you cover?',
    yourFoodOne: 'How many days does the stored food feed your home?',
    days: 'days',
    meals: (m: number) => `= ${m} meals`,
    save: 'Save',
    saving: 'Saving…',
    replaces: 'Replaces the previous value. Does not add.',
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

export type ItemSheetProps = {
  view: ItemView
  lang: Lang
  state: HouseItemState | null
  accounts: number
  houseSize: number
  houseKnown: boolean
  /** Água (L) e comida (dia-pessoa) da casa inteira. */
  houseWaterLiters: number
  houseFoodPersonDays: number
  readOnly: 'preview' | 'archived' | null
  onClose: () => void
  /** Resposta de ter ou não ter. Rejeita em caso de falha. */
  onAnswer: (answer: HouseAnswer) => Promise<void>
  /** Água ou comida. Rejeita em caso de falha. */
  onSaveAmount: (field: 'water_liters' | 'food_days', value: number) => Promise<void>
}

export default function ItemSheet(p: ItemSheetProps) {
  const t = T[p.lang]
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [busy, setBusy] = useState<HouseAnswer | 'amount' | null>(null)
  const [error, setError] = useState(false)
  const kind = p.view.item.kind
  const single = p.accounts <= 1

  // O valor da MINHA conta, para preencher o campo (§3.3).
  const [mine, setMine] = useState<{ water_liters: number; food_days: number } | null>(null)
  const [unit, setUnit] = useState<'gal' | 'L'>('gal')
  const [amount, setAmount] = useState('')

  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (kind === 'PRESENCE' || p.readOnly) return
    let alive = true
    void fetch('/api/inventory', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { inventory?: { water_liters?: number; food_days?: number } | null } | null) => {
        if (!alive) return
        const inv = { water_liters: Number(d?.inventory?.water_liters) || 0, food_days: Number(d?.inventory?.food_days) || 0 }
        setMine(inv)
        setAmount(kind === 'ENGINE_WATER' ? String(Math.round(litersToGallons(inv.water_liters) * 10) / 10) : String(inv.food_days))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [kind, p.readOnly])

  const answer = async (a: HouseAnswer) => {
    setBusy(a); setError(false)
    try {
      await p.onAnswer(a)
    } catch {
      setError(true)
    } finally {
      setBusy(null)
    }
  }

  const parsed = Number(amount.replace(',', '.'))
  const validAmount = amount.trim() !== '' && Number.isFinite(parsed) && parsed >= 0

  const saveAmount = async () => {
    if (!validAmount) return
    setBusy('amount'); setError(false)
    try {
      if (kind === 'ENGINE_WATER') await p.onSaveAmount('water_liters', unit === 'gal' ? gallonsToLiters(parsed) : parsed)
      else await p.onSaveAmount('food_days', parsed)
    } catch {
      setError(true)
    } finally {
      setBusy(null)
    }
  }

  const switchUnit = (u: 'gal' | 'L') => {
    if (u === unit) return
    if (validAmount) {
      const v = u === 'L' ? gallonsToLiters(parsed) : litersToGallons(parsed)
      setAmount(String(Math.round(v * 10) / 10))
    }
    setUnit(u)
  }

  const s = p.state
  const houseLine =
    p.view.coveredBy === 'inventory' ? t.viaInventory : s ? t.house[s.status === 'proposed' ? 'needed' : s.status] : t.house.none
  const whoLine = s && !single ? (s.by.isMe ? t.byMe(ago(s.updatedAt, p.lang)) : t.by(s.by.name || '—', ago(s.updatedAt, p.lang))) : s ? t.byMe(ago(s.updatedAt, p.lang)) : null
  const current = s?.status === 'met' ? 'have' : s?.status === 'needed' ? 'need' : s?.status === 'not_applicable' ? 'not_applicable' : null
  const disabled = Boolean(p.readOnly) || busy !== null

  return (
    <div className="sg-sheet-wrap" onClick={p.onClose}>
      <div
        className="sg-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sg-sheet-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="sg-sheet-grip" aria-hidden="true" />
        <h2 id="sg-sheet-title" ref={titleRef} tabIndex={-1}>{p.view.item.label[p.lang]}</h2>
        {p.view.item.hint && <p className="sg-muted">{p.view.item.hint[p.lang]}</p>}

        {p.readOnly && <p className="sg-sheet-note">{p.readOnly === 'preview' ? t.preview : t.archived}</p>}

        {kind === 'PRESENCE' ? (
          <>
            <div className="sg-sheet-state">
              <strong>{houseLine}</strong>
              {whoLine && p.view.coveredBy !== 'inventory' && <span className="sg-note">{whoLine}</span>}
            </div>
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
          </>
        ) : !p.houseKnown ? (
          <div className="sg-stack" style={{ gap: 10 }}>
            <p>{t.unknownHouse}</p>
            <a className="sg-btn block" href="/family">{t.family}</a>
          </div>
        ) : (
          <div className="sg-stack" style={{ gap: 12 }}>
            {!single && (
              <div className="sg-sheet-state">
                <span className="sg-label">{kind === 'ENGINE_WATER' ? t.houseWater : t.houseFood}</span>
                <strong>
                  {kind === 'ENGINE_WATER'
                    ? `${Math.round(p.houseWaterLiters)} L (${Math.round(litersToGallons(p.houseWaterLiters) * 10) / 10} gal)`
                    : `${Math.round(p.houseFoodPersonDays * MEALS_PER_PERSON_DAY)} ${p.lang === 'pt' ? 'refeições' : 'meals'}`}
                </strong>
              </div>
            )}
            <label className="sg-field">
              <span>{kind === 'ENGINE_WATER' ? (single ? t.yourWaterOne : t.yourWater) : single ? t.yourFoodOne : t.yourFood}</span>
              <div className="sg-row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                <input
                  inputMode="decimal"
                  value={amount}
                  disabled={disabled || mine === null}
                  onChange={e => setAmount(e.target.value)}
                  aria-describedby="sg-sheet-help"
                />
                {kind === 'ENGINE_WATER' ? (
                  <div className="sg-unit" role="group" aria-label={p.lang === 'pt' ? 'Unidade' : 'Unit'}>
                    {(['gal', 'L'] as const).map(u => (
                      <button key={u} type="button" className="sg-pill" aria-pressed={unit === u} disabled={disabled} onClick={() => switchUnit(u)}>{u}</button>
                    ))}
                  </div>
                ) : (
                  <span className="sg-label">{t.days}</span>
                )}
              </div>
            </label>
            <p id="sg-sheet-help" className="sg-note">
              {kind === 'ENGINE_WATER' && validAmount && unit === 'gal' && `= ${Math.round(gallonsToLiters(parsed) * 10) / 10} L · `}
              {kind === 'ENGINE_FOOD' && validAmount && single && `${t.meals(Math.round(parsed * p.houseSize * MEALS_PER_PERSON_DAY))} · `}
              {t.replaces}
            </p>
            <button type="button" className="sg-btn primary block" disabled={disabled || !validAmount || mine === null} onClick={() => void saveAmount()}>
              {busy === 'amount' ? t.saving : t.save}
            </button>
          </div>
        )}

        {error && <p className="sg-sheet-error" role="alert">{t.error}</p>}
        <button type="button" className="sg-btn block" onClick={p.onClose}>{t.close}</button>
      </div>
    </div>
  )
}
