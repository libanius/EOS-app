'use client'

/**
 * `/sinais/<slug>` — o protocolo de um Sinal (SIGNAL-001 §3.4, Marco 1).
 *
 * Ordem da página (§3.4): nível, data e título; % pronto e degraus; o que é,
 * o que não é, orientação e fontes; checklist do degrau com a cobertura de
 * cada item. Só leitura: adotar é Marco 2 (§12.2).
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import './signals.css'
import { useLanguage } from '@/lib/i18n'
import { youtubeEmbedFromId } from '@/lib/edu'
import { signalBySlug } from '@/lib/signals-content'
import { markSeen } from '@/lib/signals-seen'
import {
  DEGREE_DAYS,
  MEALS_PER_PERSON_DAY,
  MODULE_ORDER,
  protocolView,
  type Degree,
  type ItemView,
  type Signal,
  type SignalModule,
} from '@/lib/signals'
import { useSignalHouse } from './useSignalHouse'
import ItemSheet, { type AnswerResult } from './ItemSheet'
import type { HouseAnswer, HouseItemState } from '@/lib/signal-house'
import StockItemSheet, { type ItemPayload } from '@/components/stock/StockItemSheet'
import { myHomeId, type ApiHouse, type ApiItem } from '@/lib/stock-view'
import { formatDate } from './SignalsHome'

const T = {
  pt: {
    back: 'Sinais',
    notFound: 'Este Sinal não existe ou foi removido.',
    archived: (d: string) => `Sinal arquivado em ${d}. Leitura apenas.`,
    protocol: 'Protocolo',
    level: { AGIR: 'Agir', PREPARAR: 'Preparar', MONITORAR: 'Monitorar', CONTEXTO: 'Contexto' },
    readyFor: (d: Degree) => `Pronto para ${d === 'D3' ? '72 horas' : `${DEGREE_DAYS[d]} dias`}`,
    readyTip: 'Quanto do checklist deste degrau a casa já cumpre. Água e comida contam proporcionalmente; o que não se sabe não conta como pronto.',
    unknownHouse: 'Conte quem mora na casa para calcular este protocolo.',
    degreeTip: {
      D3: 'O mínimo recomendado para qualquer família.',
      D14: 'Cobre a maioria dos furacões e dos apagões longos.',
      D30: 'Para uma interrupção prolongada do abastecimento.',
      D90: 'O padrão das bases militares no FORTRESS. É o teto, não o ponto de partida.',
    } as Record<Degree, string>,
    whatItIs: 'O que é',
    video: 'Vídeo',
    whatItIsNot: 'O que não é',
    curator: 'A curadoria EOS orienta',
    unreviewed: 'Publicado antes da revisão final da curadoria.',
    forFamily: (p: number, w: number, m: number, d: Degree) =>
      `Para ${p} ${p === 1 ? 'pessoa' : 'pessoas'}, ${d === 'D3' ? '72 horas pedem' : `${DEGREE_DAYS[d]} dias pedem`} ${w} L de água e ${m} refeições.`,
    sources: 'Fontes',
    checklist: (d: Degree) => `Checklist do degrau ${d.replace('D', 'D-').replace('D-3', 'D-03')}`,
    module: { agua: 'Água', comida: 'Comida', saude: 'Saúde', energia: 'Energia', comunicacao: 'Comunicação', documentos: 'Documentos e dinheiro', casa: 'Casa' } as Record<SignalModule, string>,
    status: { covered: 'Completo', partial: 'Parcial', missing: 'Falta', unknown: 'Sem dado', not_applicable: 'Não se aplica' },
    statusTip: 'Verde: cumprido. Âmbar: em parte. Tracejado: falta dado da casa. Vazio: ainda não registrado.',
    // Acima da meta não vira fração impossível ("36 de 27"): mostra o que tem e a meta.
    water: (h: number, n: number) => (h >= n ? `${Math.round(h)} L · meta ${Math.round(n)} L` : `${Math.round(h)} de ${Math.round(n)} L`),
    food: (h: number, n: number) => {
      const have = Math.round(h * MEALS_PER_PERSON_DAY), need = Math.round(n * MEALS_PER_PERSON_DAY)
      return have >= need ? `${have} refeições · meta ${need}` : `${have} de ${need} refeições`
    },
    viaInventory: 'Registrado no inventário',
    viaRequirement: 'Marcado como adquirido',
    answerHint: 'Toque num item para dizer se a casa tem.',
    markedBy: (n: string) => `Marcado por ${n || 'outra conta da casa'}`,
    saved: 'Registrado para a casa',
    saveError: 'Não foi possível gravar. Tente de novo.',
    nextAction: 'Próxima ação',
    nextWater: (l: number) => `Garantir mais ${l} L de água`,
    nextFood: (m: number) => `Garantir mais ${m} refeições`,
    nextWhy: 'É o recurso que acaba primeiro na sua casa.',
    register: 'Registrar no que tenho',
    registerTip: 'Abre o inventário da casa. O que você registrar lá entra na conta deste protocolo.',
    copy: 'Copiar resumo para um amigo',
    copied: 'Resumo copiado',
    copyFail: 'Não foi possível copiar. Selecione o texto manualmente.',
    shareTail: 'Preparo, não pânico. EOS',
  },
  en: {
    back: 'Signals',
    notFound: 'This Signal does not exist or was removed.',
    archived: (d: string) => `Signal archived on ${d}. Read only.`,
    protocol: 'Protocol',
    level: { AGIR: 'Act', PREPARAR: 'Prepare', MONITORAR: 'Monitor', CONTEXTO: 'Context' },
    readyFor: (d: Degree) => `Ready for ${d === 'D3' ? '72 hours' : `${DEGREE_DAYS[d]} days`}`,
    readyTip: 'How much of this level checklist your home meets. Water and food count proportionally; anything unknown never counts as ready.',
    unknownHouse: 'Count who lives in your home to calculate this protocol.',
    degreeTip: {
      D3: 'The minimum recommended for any family.',
      D14: 'Covers most hurricanes and long outages.',
      D30: 'For an extended supply disruption.',
      D90: 'The standard for military bases under FORTRESS. A ceiling, not a starting point.',
    } as Record<Degree, string>,
    whatItIs: 'What it is',
    video: 'Video',
    whatItIsNot: 'What it is not',
    curator: 'EOS curators advise',
    unreviewed: 'Published before final curator review.',
    forFamily: (p: number, w: number, m: number, d: Degree) =>
      `For ${p} ${p === 1 ? 'person' : 'people'}, ${d === 'D3' ? '72 hours call' : `${DEGREE_DAYS[d]} days call`} for ${w} L of water and ${m} meals.`,
    sources: 'Sources',
    checklist: (d: Degree) => `Checklist for level ${d.replace('D', 'D-').replace('D-3', 'D-03')}`,
    module: { agua: 'Water', comida: 'Food', saude: 'Health', energia: 'Power', comunicacao: 'Communication', documentos: 'Documents and cash', casa: 'Home' } as Record<SignalModule, string>,
    status: { covered: 'Done', partial: 'Partial', missing: 'Missing', unknown: 'No data', not_applicable: 'Not needed' },
    statusTip: 'Green: done. Amber: partly. Dashed: home data missing. Empty: not recorded yet.',
    water: (h: number, n: number) => (h >= n ? `${Math.round(h)} L · goal ${Math.round(n)} L` : `${Math.round(h)} of ${Math.round(n)} L`),
    food: (h: number, n: number) => {
      const have = Math.round(h * MEALS_PER_PERSON_DAY), need = Math.round(n * MEALS_PER_PERSON_DAY)
      return have >= need ? `${have} meals · goal ${need}` : `${have} of ${need} meals`
    },
    viaInventory: 'Recorded in your inventory',
    viaRequirement: 'Marked as acquired',
    answerHint: 'Tap an item to tell us if your home has it.',
    markedBy: (n: string) => `Marked by ${n || 'someone in your home'}`,
    saved: 'Recorded for your home',
    saveError: 'Could not save. Try again.',
    nextAction: 'Next action',
    nextWater: (l: number) => `Add ${l} more L of water`,
    nextFood: (m: number) => `Add ${m} more meals`,
    nextWhy: 'It is what runs out first in your home.',
    register: 'Record what I have',
    registerTip: 'Opens your home inventory. What you record there counts toward this protocol.',
    copy: 'Copy summary for a friend',
    copied: 'Summary copied',
    copyFail: 'Could not copy. Select the text manually.',
    shareTail: 'Preparation, not panic. EOS',
  },
}

const DEGREE_LABEL: Record<Degree, string> = { D3: 'D-03', D14: 'D-14', D30: 'D-30', D90: 'D-90' }

function StatusMark({ v, label }: { v: ItemView; label: string }) {
  return (
    <span className={`sg-st ${v.status}`} role="img" aria-label={label}>
      {v.status === 'covered' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      ) : v.status === 'partial' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></svg>
      ) : v.status === 'unknown' ? '?' : v.status === 'not_applicable' ? '–' : null}
    </span>
  )
}

type SignalPageProps = {
  slug: string
  /**
   * Prévia do admin (CONTENT-001 §3.6): o Sinal vem da pauta, não do conteúdo
   * publicado. Não marca como visto e o "voltar" leva para `/admin/content`.
   */
  preview?: { signal: Signal; lang: 'pt' | 'en' }
}

export default function SignalPage({ slug, preview }: SignalPageProps) {
  const { language } = useLanguage()
  const lang = preview?.lang ?? (language === 'en' ? 'en' : 'pt')
  const t = T[lang]
  const signal = preview?.signal ?? signalBySlug(slug)
  // Um vídeo por idioma; sem vídeo no idioma da pessoa, nenhum (CONTENT-001 D-P5, E8).
  const videoRef = signal?.video?.[lang]
  const videoEmbed = youtubeEmbedFromId(videoRef?.youtubeId)
  const videoMinutes = videoRef?.durationSec ? Math.max(1, Math.round(videoRef.durationSec / 60)) : null
  const { loading, house, metKeys, notApplicableKeys, states, accounts, reload, applyState, stock, covering, applyStock } = useSignalHouse()
  const [openKey, setOpenKey] = useState<string | null>(null)
  // A ficha do estoque aberta por cima da folha do Sinal (INV-T04).
  const [stockSheet, setStockSheet] = useState<{ item: ApiItem | null; resourceKey: string; label: string } | null>(null)
  const [degree, setDegree] = useState<Degree>(signal?.protocol.recommendedDegree ?? 'D14')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (signal && !preview) markSeen(signal.slug)
  }, [signal, preview])

  // A prévia troca de versão sem desmontar: o degrau volta ao recomendado da nova.
  const recommended = signal?.protocol.recommendedDegree
  useEffect(() => {
    if (preview && recommended) setDegree(recommended)
  }, [preview, recommended])

  const view = useMemo(
    () => (signal && house ? protocolView(signal.protocol, degree, house, metKeys, notApplicableKeys) : null),
    [signal, house, degree, metKeys, notApplicableKeys],
  )

  if (!signal) {
    return (
      <main className="sg">
        <div className="sg-wrap">
          <Link className="sg-back" href={preview ? '/admin/content' : '/sinais'}>← {t.back}</Link>
          <div className="sg-empty">{t.notFound}</div>
        </div>
      </main>
    )
  }

  const sizeKnown = Boolean(house?.known && house.size > 0)
  const days = DEGREE_DAYS[degree]
  const waterNeed = view?.items.find(i => i.item.kind === 'ENGINE_WATER')
  const foodNeed = view?.items.find(i => i.item.kind === 'ENGINE_FOOD')

  const byModule = new Map<SignalModule, ItemView[]>()
  for (const v of view?.items ?? []) {
    const list = byModule.get(v.item.module) ?? []
    list.push(v)
    byModule.set(v.item.module, list)
  }

  let next: string | null = null
  if (view && sizeKnown && view.limiting) {
    const target = view.limiting === 'agua' ? waterNeed : foodNeed
    if (target && target.need !== null && target.have !== null && target.have < target.need) {
      const gap = target.need - target.have
      next = view.limiting === 'agua' ? t.nextWater(Math.ceil(gap)) : t.nextFood(Math.ceil(gap * MEALS_PER_PERSON_DAY))
    }
  }

  const openView = openKey ? view?.items.find(i => i.item.resourceKey === openKey) ?? null : null

  /** "Rádio · Midland ER310" ou "Lanterna (+1)": o que a casa tem, em uma linha. */
  const coverLine = (items: ApiItem[]) => {
    const first = items[0]
    const detail = [first.brand, first.model].filter(Boolean).join(' ')
    return `${first.label}${detail ? ` · ${detail}` : ''}${items.length > 1 ? ` (+${items.length - 1})` : ''}`
  }

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }

  /*
   * SIGNAL-002 §3.2 + INVENTORY-001 §3.4 (INV-T04): "Tenho" cria o item no
   * estoque quando a casa não tem; "Ainda não tenho" com item na casa volta com
   * os itens para a folha perguntar quais remover.
   */
  const answerItem = async (answer: HouseAnswer): Promise<AnswerResult> => {
    if (!openKey || preview) return null
    const res = await fetch('/api/signals/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: signal.slug, resourceKey: openKey, answer, lang }),
    })
    if (!res.ok) throw new Error(String(res.status))
    const d = (await res.json()) as { state?: HouseItemState | null; house?: ApiHouse; confirmRemoval?: boolean; covering?: ApiItem[] }
    if (d.house) applyStock(d.house)
    if (d.confirmRemoval) return { confirmRemoval: d.covering ?? [] }
    applyState(openKey, d.state ?? null)
    // Os totais da casa (kit médico, rádio, água) vêm da projeção do estoque.
    await reload()
    // "Tenho" deixa a folha aberta: ela mostra o item criado e oferece detalhar (D-I1).
    if (answer !== 'have') setOpenKey(null)
    flash(t.saved)
    return null
  }

  /** E5: remove só os itens escolhidos e então responde "Ainda não tenho". */
  const removeItems = async (ids: string[]) => {
    for (const id of ids) {
      const r = await fetch(`/api/holdings/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(String(r.status))
    }
    await answerItem('need')
  }

  /** A ficha do estoque (a mesma de "O que eu tenho"), aberta daqui. */
  const stockCall = async (url: string, method: string, body?: unknown): Promise<string | null> => {
    try {
      const r = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const d = (await r.json().catch(() => ({}))) as { house?: ApiHouse; error?: string }
      if (!r.ok) return d.error || t.saveError
      if (d.house) applyStock(d.house)
      await reload()
      setStockSheet(null)
      flash(t.saved)
      return null
    } catch {
      return t.saveError
    }
  }
  const saveStockItem = (payload: ItemPayload, id: string | null) =>
    stockCall(id ? `/api/holdings/${id}` : '/api/holdings', id ? 'PATCH' : 'POST', { ...payload, ...(id ? {} : { provenance: 'PROTOCOL', provenanceRef: signal.slug }) })
  const removeStockItem = (id: string) => stockCall(`/api/holdings/${id}`, 'DELETE')

  const copySummary = async () => {
    const lines = [
      `EOS · ${signal.title[lang]}`,
      '',
      `${t.whatItIs}: ${signal.whatItIs[lang]}`,
      '',
      `${t.whatItIsNot}: ${signal.whatItIsNot[lang]}`,
      '',
      signal.curatorNote[lang],
    ]
    if (sizeKnown && house) {
      lines.push('')
      for (const d of signal.protocol.degrees) {
        const w = Math.round(3.785411784 * house.size * DEGREE_DAYS[d])
        const m = house.size * DEGREE_DAYS[d] * MEALS_PER_PERSON_DAY
        lines.push(`• ${DEGREE_LABEL[d]}: ${w} L · ${m} ${lang === 'pt' ? 'refeições' : 'meals'}`)
      }
    }
    lines.push('', ...signal.sources.map(s => `${s.title}: ${s.url}`), '', t.shareTail)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setToast(t.copied)
    } catch {
      setToast(t.copyFail)
    }
    window.setTimeout(() => setToast(null), 2600)
  }

  return (
    <main className="sg">
      <div className="sg-wrap">
        <Link className="sg-back" href={preview ? '/admin/content' : '/sinais'}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          {t.back}
        </Link>

        <section className="sg-stack" style={{ gap: 12 }}>
          <div className="sg-row" style={{ gap: 10 }}>
            <span className={`sg-lv ${signal.level}`}>{t.level[signal.level]}</span>
            <span className="sg-label" style={{ fontSize: 14, color: 'var(--sg-dim)' }}>
              {t.protocol} · {formatDate(signal.occurredOn, lang)}
            </span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 7vw, 36px)', lineHeight: 1.15, fontWeight: 700 }}>{signal.title[lang]}</h1>
          {signal.status === 'archived' && <p className="sg-note">{t.archived(formatDate(signal.publishedOn, lang))}</p>}
        </section>

        <section className="sg-hero" aria-live="polite">
          {loading ? (
            <div className="sg-big" aria-busy="true">··</div>
          ) : view?.ready != null ? (
            <>
              <div className="sg-big" tabIndex={0} data-tip={t.readyTip}>
                {Math.round(view.ready * 100)}
                <small>%</small>
              </div>
              <div className="sg-bearing">{t.readyFor(degree)}</div>
            </>
          ) : (
            <>
              <p>{t.unknownHouse}</p>
              <Link className="sg-btn" href="/family">{lang === 'pt' ? 'Ir para Família' : 'Go to Family'}</Link>
            </>
          )}
        </section>

        <div className="sg-pills" role="group" aria-label={lang === 'pt' ? 'Degraus' : 'Levels'}>
          {signal.protocol.degrees.map(d => (
            <button
              key={d}
              type="button"
              className="sg-pill"
              aria-pressed={d === degree}
              data-tip={t.degreeTip[d]}
              onClick={() => setDegree(d)}
            >
              {DEGREE_LABEL[d]}
            </button>
          ))}
        </div>

        {next && (
          <section className="sg-panel sg-stack">
            <div className="sg-step">
              <div className="sg-ring">1</div>
              <div>
                <span className="sg-label mint">{t.nextAction}</span>
                <h2>{next}</h2>
                <p className="sg-muted" style={{ fontSize: 15, marginTop: 4 }}>{t.nextWhy}</p>
              </div>
            </div>
            <Link className="sg-btn primary block" href="/preparedness/o-que-tenho" data-tip={t.registerTip}>{t.register}</Link>
          </section>
        )}

        {videoEmbed && (
          <section className="sg-panel sg-stack" style={{ gap: 12 }} aria-labelledby="sg-video">
            <span id="sg-video" className="sg-label mint">
              {t.video}{videoMinutes ? ` · ${videoMinutes} min` : ''}
            </span>
            <div className="sg-video">
              <iframe
                title={`${t.video}: ${signal.title[lang]}`}
                src={videoEmbed}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </section>
        )}

        <section className="sg-stack">
          <div className="sg-panel sg-stack" style={{ gap: 10 }}>
            <span className="sg-label mint">{t.whatItIs}</span>
            <p>{signal.whatItIs[lang]}</p>
          </div>
          <div className="sg-panel sg-stack" style={{ gap: 10 }}>
            <span className="sg-label">{t.whatItIsNot}</span>
            <p>{signal.whatItIsNot[lang]}</p>
          </div>
          <div className="sg-quote">
            <span className="sg-label amber">{t.curator}</span>
            <blockquote>“{signal.curatorNote[lang]}”</blockquote>
            {sizeKnown && house && (
              <p className="sg-by">
                {t.forFamily(house.size, Math.round(3.785411784 * house.size * days), house.size * days * MEALS_PER_PERSON_DAY, degree)}
              </p>
            )}
            {!signal.reviewedByCurator && <p className="sg-by">{t.unreviewed}</p>}
          </div>
          <div className="sg-official">
            <svg viewBox="0 0 24 26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2l9 3.5v7c0 6-4 9.8-9 11.5-5-1.7-9-5.5-9-11.5v-7z" fill="currentColor" fillOpacity=".18" />
              <path d="M8 13l3 3 5-6" strokeLinecap="round" />
            </svg>
            <div>
              <span className="sg-label">{t.sources}</span>
              <p className="sg-note" style={{ marginTop: 6 }}>{signal.sourceLine[lang]}</p>
              <ul>
                {signal.sources.map(s => (
                  <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="sg-stack" aria-labelledby="sg-check">
          <div className="sg-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <h2 id="sg-check" className="sg-label" style={{ color: 'var(--sg-ink)', fontSize: 17 }}>{t.checklist(degree)}</h2>
            <span className="sg-legend" tabIndex={0} data-tip={t.statusTip} aria-label={t.statusTip}>?</span>
          </div>
          <p className="sg-note">{t.answerHint}</p>
          {MODULE_ORDER.filter(m => byModule.has(m)).map(m => (
            <div key={m} className="sg-panel" style={{ paddingBlock: 14 }}>
              <div className="sg-mod"><span className="sg-label">{t.module[m]}</span></div>
              {(byModule.get(m) ?? []).map(v => (
                <button
                  key={v.item.resourceKey}
                  type="button"
                  className="sg-req sg-req-btn"
                  aria-haspopup="dialog"
                  aria-label={`${v.item.label[lang]}: ${t.status[v.status]}. ${t.answerHint}`}
                  onClick={() => setOpenKey(v.item.resourceKey)}
                >
                  <StatusMark v={v} label={t.status[v.status]} />
                  <div style={{ minWidth: 0 }}>
                    <h3>{v.item.label[lang]}</h3>
                    {v.item.kind === 'ENGINE_WATER' && v.have !== null && v.need !== null ? (
                      <>
                        <div className="sg-h">{t.water(v.have, v.need)}</div>
                        <div className="sg-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (v.have / v.need) * 100)}%` }} /></div>
                      </>
                    ) : v.item.kind === 'ENGINE_FOOD' && v.have !== null && v.need !== null ? (
                      <>
                        <div className="sg-h">{t.food(v.have, v.need)}</div>
                        <div className="sg-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (v.have / v.need) * 100)}%` }} /></div>
                      </>
                    ) : (
                      <div className="sg-h">
                        {covering(v.item.resourceKey).length
                          ? coverLine(covering(v.item.resourceKey))
                          : v.coveredBy === 'inventory'
                          ? t.viaInventory
                          : v.coveredBy === 'requirement'
                            ? accounts > 1 && states[v.item.resourceKey] && !states[v.item.resourceKey].by.isMe
                              ? t.markedBy(states[v.item.resourceKey].by.name)
                              : t.viaRequirement
                            : v.item.hint?.[lang] ?? t.status[v.status]}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </section>

        <button type="button" className="sg-btn block" onClick={() => void copySummary()}>{t.copy}</button>
        <div role="status" aria-live="polite" className="sg-note" style={{ textAlign: 'center', minHeight: 20 }}>{toast}</div>
      </div>
      {openView && (
        <ItemSheet
          view={openView}
          lang={lang}
          state={states[openView.item.resourceKey] ?? null}
          accounts={accounts}
          me={stock?.me ?? null}
          houseKnown={sizeKnown}
          houseWaterLiters={house?.waterLiters ?? 0}
          houseFoodPersonDays={house?.foodPersonDays ?? 0}
          covering={covering(openView.item.resourceKey)}
          readOnly={preview ? 'preview' : signal.status === 'archived' ? 'archived' : null}
          onClose={() => setOpenKey(null)}
          onAnswer={answerItem}
          onRemoveItems={removeItems}
          onOpenItem={item => setStockSheet({ item, resourceKey: item.resourceKey, label: item.label })}
          onAddItem={() => setStockSheet({ item: null, resourceKey: openView.item.resourceKey, label: openView.item.label[lang] })}
        />
      )}
      {stockSheet && stock && (
        <StockItemSheet
          lang={lang}
          house={stock}
          item={stockSheet.item}
          defaultLocationId={myHomeId(stock)}
          initialResourceKey={stockSheet.resourceKey}
          initialLabel={stockSheet.label}
          onClose={() => setStockSheet(null)}
          onSave={saveStockItem}
          onRemove={removeStockItem}
        />
      )}
    </main>
  )
}
