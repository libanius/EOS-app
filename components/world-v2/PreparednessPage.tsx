'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { saveSnapshot, loadSnapshot } from '@/lib/sync'
import PreparednessNav from './PreparednessNav'
import { attentionItems, type AttentionItem } from '@/lib/attention'
import { BRIEFING_KIT_TYPE, buildBriefingProposals, type BriefingProposal } from '@/lib/briefing-actions'
import { ALERT_KIT_TYPE, alertProposals, reassess } from '@/lib/alert-reassessment'
import { useRisk } from '@/components/v2/RiskProvider'
import { useLanguage } from '@/lib/i18n'
import {
  formatGallons,
  GALLON_SHORT,
  WATER_ADEQUATE_LITERS_PER_PERSON,
  WATER_CRITICAL_LITERS_PER_PERSON,
  WATER_MIN_DAYS_FEMA,
} from '@/lib/units'

// ─── Types ────────────────────────────────────────────────────────────────────

type ChecklistTier = 'ESSENTIAL' | 'MODERATE' | 'EXCELLENT'

interface ChecklistItem {
  id: string
  kit_type: string
  canonical_key: string
  item_name: string
  tier: ChecklistTier
  quantity: number
  unit: string | null
  acquired: boolean
}



type Inventory = {
  water_liters: number
  food_days: number
  fuel_liters: number
  battery_percent: number
  has_medical_kit: boolean
  has_communication_device: boolean
  cash_amount: number
}

type ReadinessLevel = 'critical' | 'low' | 'adequate' | 'excellent'
type AIRiskLevel = 'baixo' | 'medio' | 'alto'

type AIReadinessBriefing = {
  overview: string
  risk_level: AIRiskLevel
  priorities: string[]
  strengths: string[]
  next_steps: string[]
}

// ─── Readiness score ──────────────────────────────────────────────────────────

function calcReadiness(
  inv: Inventory,
  memberCount: number,
): { score: number; level: ReadinessLevel } {
  const mc = Math.max(memberCount, 1)
  let score = 0

  // Water — 30 pts (most critical)
  // D-163: a régua é a da FEMA — 3 dias por pessoa para adequado, menos de
  // 1 dia para crítico. Antes eram 4 L e 2 L, ou seja ~1 dia e ~meio dia.
  const waterPP = inv.water_liters / mc
  if (waterPP >= WATER_ADEQUATE_LITERS_PER_PERSON) score += 30
  else if (waterPP >= WATER_CRITICAL_LITERS_PER_PERSON) score += 15

  // Food — 25 pts
  if (inv.food_days >= 7) score += 25
  else if (inv.food_days >= 3) score += 13
  else if (inv.food_days >= 1) score += 5

  // Battery — 20 pts
  if (inv.battery_percent >= 60) score += 20
  else if (inv.battery_percent >= 30) score += 10

  // Medical kit — 15 pts
  if (inv.has_medical_kit) score += 15

  // Communication — 10 pts
  if (inv.has_communication_device) score += 10

  const level: ReadinessLevel =
    score >= 80 ? 'excellent' :
    score >= 50 ? 'adequate'  :
    score >= 25 ? 'low'       : 'critical'

  return { score, level }
}

// ─── ReadinessSummary ─────────────────────────────────────────────────────────

type ReadinessSummaryProps = {
  score: number
  level: ReadinessLevel
  memberCount: number
  autonomyDays: number
}

function ReadinessSummary({ score, level, memberCount, autonomyDays }: ReadinessSummaryProps) {
  const { t } = useLanguage()
  const levelLabel: Record<ReadinessLevel, string> = {
    critical:  t('inventory.critical'),
    low:       t('inventory.low'),
    adequate:  t('inventory.adequate'),
    excellent: t('inventory.excellent'),
  }
  const levelColor: Record<ReadinessLevel, string> = {
    critical:  'var(--ac3)',
    low:       'var(--warn)',
    adequate:  'var(--ac)',
    excellent: 'var(--ac)',
  }
  const barColor: Record<ReadinessLevel, string> = {
    critical:  'var(--ac3)',
    low:       'var(--warn)',
    adequate:  'var(--ac)',
    excellent: 'var(--ac)',
  }
  const summaryBg: Record<ReadinessLevel, string> = {
    critical:  'rgba(255,107,107,0.07)',
    low:       'rgba(255,179,71,0.06)',
    adequate:  'rgba(0,229,160,0.07)',
    excellent: 'rgba(0,229,160,0.07)',
  }
  const summaryBorder: Record<ReadinessLevel, string> = {
    critical:  '1px solid rgba(255,107,107,0.25)',
    low:       '1px solid rgba(255,179,71,0.25)',
    adequate:  '1px solid rgba(0,229,160,0.18)',
    excellent: '1px solid rgba(0,229,160,0.18)',
  }

  return (
    <div
      style={{
        ...S.summaryCard,
        background: summaryBg[level],
        border: summaryBorder[level],
      }}
    >
      {/* Top row */}
      <div style={S.summaryTop}>
        <div>
          {/*
            D-162: a nota mede CINCO recursos da casa (água, comida, bateria,
            kit médico, comunicação). Ela não sabe nada sobre plano, mochilas,
            treino ou cenário — e chamá-la de "prontidão" prometia um número que
            ela não entrega. O rótulo passa a dizer o que ela mede, e a linha
            abaixo diz o que ela NÃO mede: um número honesto sobre pouco vale
            mais que um número vago sobre tudo.
          */}
          <p style={S.summaryLabel}>{t('inventory.readiness')}</p>
          <p style={S.summaryHint}>{t('inventory.readinessHint')}</p>
          <div style={S.summaryScoreRow}>
            <span
              style={{
                ...S.summaryScore,
                color: levelColor[level],
              }}
            >
              {String(score).padStart(2, '0')}
            </span>
            <span style={S.summaryScoreMax}>/100</span>
          </div>
        </div>

        <div style={S.summaryRight}>
          <span
            style={{
              ...S.levelBadge,
              color: levelColor[level],
              background:
                level === 'critical' ? 'rgba(255,107,107,0.15)' :
                level === 'low'      ? 'rgba(255,179,71,0.15)'  :
                                       'rgba(0,229,160,0.12)',
              border: `1px solid ${
                level === 'critical' ? 'rgba(255,107,107,0.3)' :
                level === 'low'      ? 'rgba(255,179,71,0.3)'  :
                                       'rgba(0,229,160,0.25)'
              }`,
            }}
          >
            {levelLabel[level]}
          </span>
          {memberCount > 0 && (
            <span style={S.memberChip}>
              {memberCount} {t('inventory.members')}
            </span>
          )}
        </div>
      </div>

      {/* Score bar */}
      <div style={S.scoreBarTrack}>
        <div
          style={{
            ...S.scoreBarFill,
            width: `${score}%`,
            background: barColor[level],
            boxShadow: `0 0 8px ${barColor[level]}66`,
          }}
        />
      </div>

      {/* Autonomy row */}
      <div style={S.autonomyRow}>
        <span style={S.autonomyLabel}>{t('inventory.autonomy')}</span>
        <span style={S.autonomyValue}>
          <span style={{ color: levelColor[level], fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
            {autonomyDays}
          </span>
          {' '}{t('inventory.days')}
        </span>
      </div>
    </div>
  )
}

// ─── Checklist × Inventário ──────────────────────────────────────────────────
// `getInventoryDelta()` vivia aqui e foi retirado por D-156 / PREP-T11.
// A regra que o substitui — e o porquê — estão em `lib/checklist-inventory.ts`.

// ─── Toggle ───────────────────────────────────────────────────────────────────

/**
 * D-159 + D-163: uma chave, um aviso, uma vez.
 *
 * O aviso mora na VISÃO e não em "O que eu tenho": ele explica por que a
 * autonomia encolheu, e autonomia é o que a Visão mostra.
 */
const RULER_NOTICE_KEY = 'eos-water-fema-standard-seen'

const DEFAULT_INVENTORY: Inventory = {
  water_liters: 0,
  food_days: 0,
  fuel_liters: 0,
  battery_percent: 0,
  has_medical_kit: false,
  has_communication_device: false,
  cash_amount: 0,
}

export default function PreparednessPage() {
  const { language, t } = useLanguage()
  /*
   * D-168: o alerta ao vivo vem do RiskProvider, que já está montado no layout
   * e já carregou. Nenhum fetch novo — a Preparação lê a MESMA verdade que o
   * MUNDO mostra, e duas telas que buscam a mesma coisa acabam divergindo.
   */
  const { snapshot } = useRisk()
  const [inv, setInv] = useState<Inventory>(DEFAULT_INVENTORY)
  const [memberCount, setMemberCount] = useState(0)
  /**
   * A casa, vinda do servidor (D-123).
   *
   * O editor abaixo continua sendo a SUA despensa — você só pode mexer na sua.
   * Mas a nota e a autonomia passam a ser da casa: com quatro pessoas morando
   * juntas, avaliar a sua despensa sozinha contra quatro bocas dava uma nota
   * ruim que não correspondia a nada.
   */
  const [house, setHouse] = useState<{ size: number; autonomyDays: number | null; contributors: number; water: number; foodPersonDays: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiBriefing, setAiBriefing] = useState<AIReadinessBriefing | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  /**
   * O aviso da régua nova (D-159). Nasce escondido e só aparece depois de
   * montar: ler `localStorage` durante o render faria o servidor e o cliente
   * discordarem, e um aviso que pisca é pior que nenhum.
   */
  const [briefingAberto, setBriefingAberto] = useState(false)
  /** Uma proposta por vez: `salvando` enquanto grava, `salvo` depois. */
  const [salvos, setSalvos] = useState<Record<string, 'salvando' | 'salvo'>>({})
  const [showRulerNotice, setShowRulerNotice] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(RULER_NOTICE_KEY) !== 'seen') setShowRulerNotice(true)
    } catch {
      /* Sem localStorage o aviso simplesmente não aparece. Ele é informativo. */
    }
  }, [])
  const dismissRulerNotice = useCallback(() => {
    setShowRulerNotice(false)
    try { localStorage.setItem(RULER_NOTICE_KEY, 'seen') } catch { /* idem */ }
  }, [])

  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([])


  // ── Load ───────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    setSaveError(null)
    // Show snapshot immediately
    const snap = loadSnapshot<{ inv: object; memberCount: number }>('inventory')
    if (snap) {
      if (snap.inv) setInv(prev => ({ ...prev, ...(snap.inv as typeof prev) }))
      if (snap.memberCount != null) setMemberCount(snap.memberCount)
    }
    try {
      const [invRes, famRes, clRes, hhRes] = await Promise.all([
        fetch('/api/inventory'),
        fetch('/api/family-members'),
        fetch('/api/checklist', { cache: 'no-store' }),
        fetch('/api/household'),
      ])
      let parsedInv: Record<string, unknown> | null = null
      if (invRes.ok) {
        const { inventory } = await invRes.json()
        parsedInv = inventory
        setInv({
          water_liters:             Number(inventory.water_liters)             || 0,
          food_days:                Number(inventory.food_days)                || 0,
          fuel_liters:              Number(inventory.fuel_liters)              || 0,
          battery_percent:          Number(inventory.battery_percent)          || 0,
          has_medical_kit:          Boolean(inventory.has_medical_kit),
          has_communication_device: Boolean(inventory.has_communication_device),
          cash_amount:              Number(inventory.cash_amount)              || 0,
        })
      }
      if (hhRes?.ok) {
        const h = await hhRes.json()
        if (h?.known) {
          setHouse({
            size: h.size,
            autonomyDays: typeof h.autonomyDays === 'number' ? h.autonomyDays : null,
            contributors: h.inventory?.contributors ?? 0,
            water: h.inventory?.waterLiters ?? 0,
            foodPersonDays: h.inventory?.foodPersonDays ?? 0,
          })
          setMemberCount(h.size)
          if (parsedInv) saveSnapshot('inventory', { inv: parsedInv, memberCount: h.size })
        }
      } else if (famRes.ok) {
        // Sem a casa, a contagem antiga é melhor que zero — mas nunca substitui
        // a autonomia, que fica nula em vez de virar palpite.
        const { members } = await famRes.json()
        const mc = Array.isArray(members) ? members.length : 0
        setMemberCount(mc)
        if (parsedInv) saveSnapshot('inventory', { inv: parsedInv, memberCount: mc })
      }
      if (clRes.ok) {
        const { items } = await clRes.json()
        setChecklistItems(Array.isArray(items) ? items : [])
      }
    } catch {
      setSaveError(t('inventory.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadData() }, [loadData])
  useRealtimeSync(['resource_inventory', 'family_members', 'checklists'], () => { void loadData() })

  /**
   * O usuário confirma UMA proposta. Só então algo é gravado (D-085 regra 2).
   *
   * Vai para o mesmo endereço de Pilot, EDU e simulação — a lista de requisitos
   * —, com `kit_type` de recomendação do Pilot, e aparece em "O que falta" com
   * o selo "via Pilot". Fonte visível é obrigatória (D-085 regra 3).
   */
  const confirmarProposta = useCallback(async (
    proposta: Pick<BriefingProposal, 'name' | 'tier' | 'quantity' | 'unit'>,
    kitType: string = BRIEFING_KIT_TYPE,
  ) => {
    setSalvos(prev => ({ ...prev, [proposta.name]: 'salvando' }))
    try {
      const res = await fetch('/api/checklist/save-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kitType,
          items: [{ name: proposta.name, tier: proposta.tier, quantity: proposta.quantity, unit: proposta.unit }],
        }),
      })
      if (!res.ok) throw new Error('save failed')
      setSalvos(prev => ({ ...prev, [proposta.name]: 'salvo' }))
      void loadData()
    } catch {
      // Volta ao estado anterior: um botão que diz "salvo" sem ter salvado é
      // pior que um botão que falhou.
      setSalvos(prev => {
        const next = { ...prev }
        delete next[proposta.name]
        return next
      })
    }
  }, [loadData])

  const loadAIBriefing = useCallback(async () => {
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/ai/readiness')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAiBriefing(null)
        setAiError(data.error ?? t('inventory.aiError'))
        return
      }

      setAiBriefing(data.briefing ?? null)
    } catch {
      setAiBriefing(null)
      setAiError(t('inventory.aiNetworkError'))
    } finally {
      setAiLoading(false)
    }
  }, [t])

  // ── Auto-save ──────────────────────────────────────────────────────────────






  // ── Derived ────────────────────────────────────────────────────────────────
  /*
   * Nota e autonomia olham a CASA; o editor continua pessoal.
   *
   * Antes: `Math.floor(inv.food_days)` — os meus dias de comida, sem dividir
   * por ninguém e sem somar a água de quem mora junto. Numa casa de quatro isso
   * errava para os dois lados ao mesmo tempo.
   */
  const invParaNota = house
    ? { ...inv, water_liters: house.water, food_days: house.size > 0 ? house.foodPersonDays / house.size : 0 }
    : inv
  const { score, level } = calcReadiness(invParaNota, memberCount)

  /*
   * A lista de atenção lê a CASA quando ela é conhecida — os mesmos números da
   * nota. `house?.size ?? 0` e não `memberCount`: zero significa desconhecido,
   * e `lib/attention` transforma isso num item próprio em vez de dividir por 1
   * em silêncio.
   */
  const propostas = aiBriefing ? buildBriefingProposals(aiBriefing) : []

  const essenciais = checklistItems.filter(i => i.tier === 'ESSENTIAL')
  const atencao = attentionItems({
    waterLiters: invParaNota.water_liters,
    foodDays: invParaNota.food_days,
    batteryPercent: inv.battery_percent,
    hasMedicalKit: inv.has_medical_kit,
    hasCommunicationDevice: inv.has_communication_device,
    householdSize: house?.size ?? 0,
    essentialDone: essenciais.filter(i => i.acquired).length,
    essentialTotal: essenciais.length,
  })

  /*
   * A reavaliação é DETERMINÍSTICA e roda aqui, com o usuário presente. Nenhuma
   * IA decide se o evento importa, e nada é preparado no cron para uma casa que
   * talvez nunca abra o app.
   */
  const reavaliacao = reassess(snapshot?.alerts ?? [], atencao)

  /*
   * As lacunas do alerta viradas em tarefa, com números determinísticos —
   * quanto falta, para quantas pessoas, para quantos dias (D-167). O aviso
   * expira; a linha fica no checklist e será lida depois, sozinha.
   */
  const propostasDoAlerta = alertProposals(reavaliacao.gaps, {
    pt: language === 'pt',
    householdSize: house?.size ?? 0,
  })

  const autonomyDays = house?.autonomyDays != null ? Math.floor(house.autonomyDays) : Math.floor(inv.food_days)
  const aiRiskColor: Record<AIRiskLevel, string> = {
    baixo: 'var(--ac)',
    medio: 'var(--warn)',
    alto: 'var(--ac3)',
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={S.loadingWrap}>
        <span style={S.loadingDot} />
        <span style={S.loadingText}>{t('inventory.loading')}</span>
      </div>
    )
  }

  return (
    <div style={S.page}>
      <div style={S.pageWidth}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <p style={S.headerLabel}>{t('inventory.eyebrow')}</p>
            <h1 style={S.headerTitle}>{t('inventory.title')}</h1>
          </div>
        </div>

        {/*
          A faixa vem DEPOIS do título: primeiro você sabe em que domínio está,
          depois escolhe a seção. Ao rolar, o título sai e a faixa fica grudada
          no topo — é o comportamento de título grande do iOS.
        */}
        <PreparednessNav />

        {saveError && (
          <div style={S.errorBanner}>⚠ {saveError}</div>
        )}

        {/*
          D-159: a régua da água mudou de 3 L para 1 galão (FEMA) por pessoa por
          dia, e a autonomia exibida caiu ~21% para todo mundo de uma vez.

          Um número de segurança que piora sozinho, sem explicação, é lido como
          perda de estoque ou como defeito — e a pessoa tira a conclusão errada
          justamente sobre o número que mais precisa ser confiável. Por isso o
          aviso existe, aparece uma vez e some para sempre.
        */}
        {showRulerNotice && (
          <div style={S.rulerNotice}>
            <p style={S.rulerNoticeText}>
              {language === 'pt'
                ? `A régua da água agora é a da FEMA: 1 galão por pessoa por dia, com mínimo de ${WATER_MIN_DAYS_FEMA} dias. Seu estoque não mudou — a conta ficou mais rigorosa, e o que antes aparecia como adequado cobria cerca de um dia.`
                : `The water standard is now FEMA’s: 1 gallon per person per day, ${WATER_MIN_DAYS_FEMA}-day minimum. Your supplies did not change — the math got stricter, and what used to read as adequate covered about one day.`}
            </p>
            <button type="button" onClick={dismissRulerNotice} style={S.rulerNoticeButton}>
              {language === 'pt' ? 'Entendi' : 'Got it'}
            </button>
          </div>
        )}

        {/* ── Resumo de Prontidão ─────────────────────────────────────────── */}
        <ReadinessSummary
          score={score}
          level={level}
          memberCount={memberCount}
          autonomyDays={autonomyDays}
        />

        {/*
          ── Briefing de IA, recolhido ──────────────────────────────────────
          Ele ocupava o segundo lugar mais valioso da tela e, na maioria das
          visitas, estava VAZIO — um espaço nobre guardado para um placeholder.
          Agora é uma linha; quem quer, abre.

          Achado do dono, registrado como PREP-T14: depois da análise ele não
          gera CTA nenhum. Um briefing que termina em prosa contraria a regra 1
          do D-085 — "preparação é acionável ou não pertence aqui". Recolher
          resolve o espaço; NÃO resolve isso.
        */}
        {!briefingAberto && !aiBriefing ? (
          <button type="button" onClick={() => setBriefingAberto(true)} style={S.linhaAcao}>
            <span style={S.portaTexto}>
              <span style={S.portaTitulo}>{t('inventory.aiTitle')}</span>
              <span style={S.portaEstado}>
                {language === 'pt' ? 'Análise da sua prontidão com IA' : 'AI analysis of your readiness'}
              </span>
            </span>
            <span style={S.portaSeta} aria-hidden>›</span>
          </button>
        ) : (
        <div style={S.aiCard}>
          <div style={S.aiHeader}>
            <div>
              <p style={S.aiLabel}>OPENAI BRIEFING</p>
              <h2 style={S.aiTitle}>{t('inventory.aiTitle')}</h2>
            </div>
            <button
              className="btn bp bsm"
              onClick={loadAIBriefing}
              disabled={aiLoading}
              style={S.aiButton}
            >
              {aiLoading ? t('inventory.aiAnalyze') : aiBriefing ? t('inventory.aiRefresh') : t('inventory.aiGenerate')}
            </button>
          </div>

          {aiError && <div style={S.errorBanner}>⚠ {aiError}</div>}

          {!aiBriefing && !aiLoading && !aiError && (
            <p style={S.aiPlaceholder}>
              {t('inventory.aiPrompt')}
            </p>
          )}

          {aiLoading && (
            <p style={S.aiPlaceholder}>{t('inventory.aiLoading')}</p>
          )}

          {aiBriefing && (
            <div style={S.aiBody}>
              <div style={S.aiOverviewRow}>
                <span
                  style={{
                    ...S.aiRiskBadge,
                    color: aiRiskColor[aiBriefing.risk_level],
                    border: `1px solid ${aiRiskColor[aiBriefing.risk_level]}44`,
                    background: `${aiRiskColor[aiBriefing.risk_level]}14`,
                  }}
                >
                  {t('inventory.risk')} {aiBriefing.risk_level}
                </span>
                <p style={S.aiOverview}>{aiBriefing.overview}</p>
              </div>

              <div style={S.aiGrid}>
                <AIList title={t('inventory.priorities')} items={aiBriefing.priorities} />
                <AIList title={t('inventory.strengths')} items={aiBriefing.strengths} />
              </div>

              {/*
                ── Próximos passos viram AÇÃO ────────────────────────────────
                Achado do dono: o briefing terminava em prosa. Isso contraria a
                regra 1 do D-085 — "preparação é acionável ou não pertence
                aqui" —, que o EOS escrevia e não cumpria na própria tela de
                prontidão.

                Cada proposta é confirmada UMA A UMA. Nada é gravado por ter
                sido gerado: escrita silenciosa a partir de saída de modelo é o
                que a arquitetura proíbe (docs/37 §4), e vale igual quando o
                modelo acerta.
              */}
              {propostas.length > 0 && (
                <div style={S.propostas}>
                  <p style={S.summaryLabel}>{t('inventory.nextSteps')}</p>
                  {propostas.map(proposta => {
                    const estado = salvos[proposta.name]
                    return (
                      <div key={proposta.name} style={S.proposta}>
                        <span style={S.propostaTexto}>{proposta.name}</span>
                        {estado === 'salvo' ? (
                          <span style={S.propostaFeito}>
                            {language === 'pt' ? '✓ na lista' : '✓ on the list'}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={estado === 'salvando'}
                            onClick={() => confirmarProposta(proposta)}
                            style={S.propostaBotao}
                          >
                            {estado === 'salvando'
                              ? (language === 'pt' ? 'Salvando…' : 'Saving…')
                              : (language === 'pt' ? 'Adicionar' : 'Add')}
                          </button>
                        )}
                      </div>
                    )
                  })}
                  <p style={S.propostaRodape}>
                    {language === 'pt'
                      ? 'Vai para “O que falta”, marcado como sugestão do Pilot.'
                      : 'Goes to “What’s missing”, marked as a Pilot suggestion.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/*
          ── Alerta ativo reordena o que é urgente ──────────────────────────
          A quarta entrada do laço (docs/37 §6). O alerta não cria necessidade
          nova: ele torna urgente a que já existia, e empurra o resto para
          baixo.

          Alerta relevante SEM lacuna correspondente não aparece aqui. A casa
          está pronta para este evento, e dizer "atenção" assim mesmo gasta a
          atenção que o próximo evento vai precisar.
        */}
        {reavaliacao.warranted && reavaliacao.alert && (
          <div style={S.alertaBloco}>
            <div style={S.alertaTopo}>
              <span style={S.alertaMarca} aria-hidden>⚠</span>
              <span style={S.alertaFonte}>{reavaliacao.alert.source.toUpperCase()}</span>
              <span style={S.alertaSeveridade}>{reavaliacao.alert.severity}</span>
            </div>
            <p style={S.alertaTitulo}>{reavaliacao.alert.headline}</p>
            <p style={S.alertaTexto}>
              {language === 'pt'
                ? `Por causa deste alerta, ${reavaliacao.gaps.length} ${reavaliacao.gaps.length === 1 ? 'lacuna fica' : 'lacunas ficam'} urgente${reavaliacao.gaps.length === 1 ? '' : 's'}:`
                : `Because of this alert, ${reavaliacao.gaps.length} gap${reavaliacao.gaps.length === 1 ? '' : 's'} became urgent:`}
            </p>
            <div style={S.atencaoLista}>
              {reavaliacao.gaps.map(item => (
                <a key={item.kind} href={item.where === 'requirements' ? '/preparedness/o-que-falta' : '/preparedness/o-que-tenho'} style={S.atencaoLinha}>
                  <span style={{ ...S.atencaoMarca, color: 'var(--ac3)' }} aria-hidden>›</span>
                  <span style={S.atencaoTexto}>{fraseAtencao(item, language === 'pt')}</span>
                </a>
              ))}
            </div>

            {/*
              As lacunas viram tarefa — uma confirmação por vez, como em todas
              as outras entradas do laço. Nada é gravado por causa do alerta;
              gravado é o que o usuário confirmou durante ele.
            */}
            {propostasDoAlerta.length > 0 && (
              <div style={S.propostas}>
                {propostasDoAlerta.map(proposta => {
                  const estado = salvos[proposta.name]
                  return (
                    <div key={proposta.name} style={S.proposta}>
                      <span style={S.propostaTexto}>{proposta.name}</span>
                      {estado === 'salvo' ? (
                        <span style={S.propostaFeito}>{language === 'pt' ? '✓ na lista' : '✓ on the list'}</span>
                      ) : (
                        <button
                          type="button"
                          disabled={estado === 'salvando'}
                          onClick={() => confirmarProposta(proposta, ALERT_KIT_TYPE)}
                          style={S.propostaBotao}
                        >
                          {estado === 'salvando'
                            ? (language === 'pt' ? 'Salvando…' : 'Saving…')
                            : (language === 'pt' ? 'Adicionar' : 'Add')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/*
          ── Precisa de atenção ─────────────────────────────────────────────
          Os seis editores saíram daqui (fase 2). O que fica é o SINAL deles.

          A nota dizia "37/100 · crítico" no topo e o que ela diagnosticava
          ficava 400px abaixo, preso dentro de cada card. Não havia caminho do
          problema até a ação — a tela respondia "onde estou" e não respondia
          "para onde eu vou". Agora cada problema é uma linha que leva ao lugar
          onde se conserta.

          A regra mora em `lib/attention.ts`, com teste: uma decisão de
          segurança dentro de JSX não teria como ser verificada.
        */}
        <div style={S.atencaoBloco}>
          <div style={S.atencaoTopo}>
            <p style={S.summaryLabel}>{language === 'pt' ? 'Precisa de atenção' : 'Needs attention'}</p>
            {atencao.length > 0 && <span style={S.atencaoContagem}>{atencao.length}</span>}
          </div>

          {atencao.length === 0 ? (
            /*
              Nada pendente é dito com palavras, e não sumindo: uma seção que
              desaparece é indistinguível de uma que falhou ao carregar.
            */
            <p style={S.atencaoVazio}>
              {language === 'pt'
                ? 'Nada pendente nos itens que o EOS acompanha.'
                : 'Nothing pending in what EOS tracks.'}
            </p>
          ) : (
            <div style={S.atencaoLista}>
              {atencao.map(item => {
                const destino = item.where === 'requirements' ? '/preparedness/o-que-falta'
                  : item.where === 'household' ? '/family/cadastro'
                  : '/preparedness/o-que-tenho'
                const cor = item.severity === 'critical' ? 'var(--ac3)'
                  : item.severity === 'unknown' ? 'var(--mu)'
                  : 'var(--warn)'
                const marca = item.severity === 'critical' ? '⚠' : item.severity === 'unknown' ? '?' : '▲'
                return (
                  <a key={item.kind} href={destino} style={S.atencaoLinha}>
                    <span style={{ ...S.atencaoMarca, color: cor }} aria-hidden>{marca}</span>
                    <span style={S.atencaoTexto}>{fraseAtencao(item, language === 'pt')}</span>
                    <span style={S.portaSeta} aria-hidden>›</span>
                  </a>
                )
              })}
            </div>
          )}
        </div>

        {/*
          ── Porta para "O que falta" ────────────────────────────────────────
          O checklist saiu daqui (PREP-T07 / D-164). Ele ocupava o fim de uma
          rolagem longa e tinha cadência própria — uma sessão de compra, não uma
          consulta. O que fica é a porta, com o estado dela, porque a Visão
          precisa dizer PARA ONDE IR e não fazer tudo.

          Este cartão está dentro da rolagem e ao alcance do polegar; os chips
          do topo são o caminho de repetição.
        */}
        <a href="/preparedness/o-que-tenho" style={S.porta}>
          <span style={S.portaTexto}>
            <span style={S.portaTitulo}>{language === 'pt' ? 'O que eu tenho' : 'What I have'}</span>
            <span style={S.portaEstado}>
              {language === 'pt'
                ? `${formatGallons(inv.water_liters)} ${GALLON_SHORT} de água · ${Math.floor(inv.food_days)} dias de comida`
                : `${formatGallons(inv.water_liters)} ${GALLON_SHORT} water · ${Math.floor(inv.food_days)} days food`}
            </span>
          </span>
          <span style={S.portaSeta} aria-hidden>›</span>
        </a>

        <a href="/edu" style={S.porta}>
          <span style={S.portaTexto}>
            <span style={S.portaTitulo}>{language === 'pt' ? 'Aprender' : 'Learn'}</span>
            <span style={S.portaEstado}>
              {language === 'pt' ? 'Guias e vídeos aprovados, por cenário' : 'Approved guides and videos, by scenario'}
            </span>
          </span>
          <span style={S.portaSeta} aria-hidden>›</span>
        </a>

        <a href="/preparedness/o-que-falta" style={S.porta}>
          <span style={S.portaTexto}>
            <span style={S.portaTitulo}>{language === 'pt' ? 'O que falta' : 'What’s missing'}</span>
            <span style={S.portaEstado}>
              {checklistItems.length === 0
                ? (language === 'pt' ? 'Nenhuma lista ainda' : 'No list yet')
                : `${checklistItems.filter(i => !i.acquired).length} ${language === 'pt' ? 'itens em aberto' : 'open items'}`}
            </span>
          </span>
          <span style={S.portaSeta} aria-hidden>›</span>
        </a>

        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}

/**
 * A frase de cada item de atenção.
 *
 * O texto mora aqui e não em `lib/attention`: a biblioteca devolve FATOS
 * (quantos dias, quantos de quantos), e traduzir é trabalho da tela. Misturar
 * os dois tornaria a regra de segurança dependente de idioma.
 */
function fraseAtencao(item: AttentionItem, pt: boolean): string {
  const dias = item.detail.days ?? 0
  switch (item.kind) {
    case 'household-unknown':
      return pt
        ? 'Não sabemos quantas pessoas moram aqui — os números abaixo são estimativas'
        : 'We don’t know how many people live here — the numbers below are estimates'
    case 'water':
      return pt
        ? `Água: ${dias.toFixed(1)} dia(s) por pessoa, contra ${WATER_MIN_DAYS_FEMA} do mínimo`
        : `Water: ${dias.toFixed(1)} day(s) per person, against a ${WATER_MIN_DAYS_FEMA}-day minimum`
    case 'food':
      return pt
        ? `Comida: ${dias.toFixed(0)} dia(s) de suprimento`
        : `Food: ${dias.toFixed(0)} day(s) of supply`
    case 'battery':
      return pt
        ? `Bateria em ${Math.round(item.detail.percent ?? 0)}%`
        : `Battery at ${Math.round(item.detail.percent ?? 0)}%`
    case 'medical-kit':
      return pt ? 'Sem kit médico registrado' : 'No medical kit on record'
    case 'comms':
      return pt ? 'Sem rádio ou meio de comunicação reserva' : 'No radio or backup comms'
    case 'checklist-essential':
      return pt
        ? `Checklist essencial: ${item.detail.done} de ${item.detail.total}`
        : `Essential checklist: ${item.detail.done} of ${item.detail.total}`
  }
}

function AIList({
  title,
  items,
  fullWidth = false,
}: {
  title: string
  items: string[]
  fullWidth?: boolean
}) {
  if (items.length === 0) return null

  return (
    <div style={fullWidth ? S.aiListFull : S.aiListCard}>
      <p style={S.aiListTitle}>{title}</p>
      <div style={S.aiListWrap}>
        {items.map((item) => (
          <div key={`${title}-${item}`} style={S.aiListItem}>
            <span style={S.aiListDot} />
            <span style={S.aiListText}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch' as const,
    padding: '16px 16px 100px',
    background: 'var(--bg)',
    minHeight: '100dvh',
  },
  pageWidth: { maxWidth: 600, margin: '0 auto' },

  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 20, paddingTop: 8,
  },
  headerLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--mu)',
    textTransform: 'uppercase' as const, marginBottom: 4,
  },
  headerTitle: { fontSize: 28, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.1 },
  headerStatus: { display: 'flex', alignItems: 'center', paddingTop: 8 },
  savingDot: {
    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
    background: 'var(--ac)', animation: 'blink 1.4s ease-in-out infinite',
  },
  savedBadge: {
    fontSize: 11, fontWeight: 700, color: 'var(--ac)',
    fontFamily: "'DM Mono', monospace", letterSpacing: '0.5px',
  },
  errorBanner: {
    background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)',
    borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--ac3)',
    marginBottom: 12, fontWeight: 600,
  },
  /*
    Aviso da régua (D-159). Informativo, não alarme: usa a superfície neutra e
    não o vermelho de erro nem o verde de acento. Nada quebrou e nada melhorou —
    a conta ficou mais rigorosa, e a cor não deve dizer outra coisa.
  */
  rulerNotice: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    background: 'var(--sf)', border: '1px solid var(--bd)',
    borderRadius: 12, padding: '12px 14px', marginBottom: 16,
  },
  rulerNoticeText: {
    flex: 1, margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--mu)',
  },
  rulerNoticeButton: {
    flexShrink: 0, alignSelf: 'center',
    background: 'transparent', border: '1px solid var(--bd)', borderRadius: 8,
    padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--tx)',
    cursor: 'pointer',
  },
  aiCard: {
    background: 'rgba(0,229,160,0.05)',
    border: '1px solid rgba(0,229,160,0.18)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  aiHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  aiLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '1.2px',
    color: 'var(--ac)',
    textTransform: 'uppercase' as const,
    fontFamily: "'DM Mono', monospace",
    marginBottom: 6,
  },
  aiTitle: {
    fontSize: 20,
    lineHeight: 1.2,
    color: 'var(--tx)',
    fontWeight: 700,
  },
  aiButton: {
    minWidth: 124,
    flexShrink: 0,
  },
  aiPlaceholder: {
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--mu)',
  },
  aiBody: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },
  aiOverviewRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  aiRiskBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    padding: '5px 10px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    fontFamily: "'DM Mono', monospace",
  },
  aiOverview: {
    fontSize: 14,
    lineHeight: 1.6,
    color: 'var(--tx)',
  },
  aiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  },
  aiListCard: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--bd)',
    borderRadius: 12,
    padding: 14,
  },
  aiListFull: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--bd)',
    borderRadius: 12,
    padding: 14,
  },
  aiListTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '1px',
    color: 'var(--mu)',
    textTransform: 'uppercase' as const,
    fontFamily: "'DM Mono', monospace",
    marginBottom: 10,
  },
  aiListWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  aiListItem: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  },
  aiListDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--ac)',
    marginTop: 6,
    flexShrink: 0,
  },
  aiListText: {
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--tx)',
  },
  itemActionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  actionButton: {
    minHeight: 30,
    borderRadius: 8,
    border: '1px solid var(--bd)',
    background: 'rgba(255,255,255,0.03)',
    color: 'var(--mu)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '6px 9px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  modalBackdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 500,
    background: 'rgba(0,0,0,0.62)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modal: {
    width: 'min(420px, 100%)',
    borderRadius: 16,
    border: '1px solid var(--bd)',
    background: 'var(--sf)',
    padding: 16,
    boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
  },
  modalTitle: {
    margin: '0 0 14px',
    color: 'var(--tx)',
    fontSize: 20,
    fontWeight: 700,
  },
  modalBody: {
    margin: '0 0 16px',
    color: 'var(--mu)',
    fontSize: 14,
    lineHeight: 1.5,
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    color: 'var(--mu)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
    marginBottom: 12,
  },
  textInput: {
    width: '100%',
    border: '1px solid var(--bd)',
    borderRadius: 10,
    background: 'rgba(0,0,0,0.18)',
    color: 'var(--tx)',
    padding: '10px 12px',
    fontSize: 15,
    outline: 'none',
  },
  tierButton: {
    border: '1px solid var(--bd)',
    borderRadius: 999,
    padding: '7px 10px',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.8px',
    cursor: 'pointer',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  secondaryButton: {
    border: '1px solid var(--bd)',
    borderRadius: 10,
    background: 'transparent',
    color: 'var(--tx)',
    padding: '10px 14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  primaryButton: {
    border: 'none',
    borderRadius: 10,
    background: 'var(--ac)',
    color: '#0a0a0f',
    padding: '10px 14px',
    fontWeight: 800,
    cursor: 'pointer',
  },

  // ── ReadinessSummary ──────────────────────────────────────────────────────
  summaryCard: {
    borderRadius: 16, padding: 16, marginBottom: 12,
    transition: 'border-color 0.3s, background 0.3s',
  },
  summaryTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '1.2px',
    color: 'var(--mu)', textTransform: 'uppercase' as const,
    fontFamily: "'DM Mono', monospace", marginBottom: 2,
  },
  alertaBloco: {
    marginTop: 20, padding: '14px 16px', borderRadius: 12,
    border: '1px solid rgba(255,107,107,0.35)', background: 'rgba(255,107,107,0.06)',
  },
  alertaTopo: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  alertaMarca: { fontSize: 13, color: 'var(--ac3)' },
  alertaFonte: {
    fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: 'var(--ac3)',
    fontFamily: "'DM Mono', monospace",
  },
  alertaSeveridade: {
    fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--mu)',
    fontFamily: "'DM Mono', monospace", marginLeft: 'auto',
  },
  alertaTitulo: { margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--tx)', lineHeight: 1.4 },
  alertaTexto: { margin: '0 0 4px', fontSize: 13, color: 'var(--mu)', lineHeight: 1.45 },
  atencaoBloco: {
    marginTop: 20, padding: '14px 16px', borderRadius: 12,
    border: '1px solid var(--bd)', background: 'var(--sf)',
  },
  atencaoTopo: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  atencaoContagem: {
    fontSize: 12, fontWeight: 700, color: 'var(--mu)',
    fontFamily: "'DM Mono', monospace",
  },
  atencaoVazio: { margin: '8px 0 0', fontSize: 13, color: 'var(--mu)', lineHeight: 1.5 },
  atencaoLista: { display: 'flex', flexDirection: 'column' as const, marginTop: 4 },
  atencaoLinha: {
    display: 'flex', alignItems: 'center', gap: 10, minHeight: 44,
    padding: '8px 0', borderBottom: '1px solid var(--bd)', textDecoration: 'none',
  },
  atencaoMarca: { fontSize: 13, width: 16, flexShrink: 0, textAlign: 'center' as const },
  atencaoTexto: { flex: 1, fontSize: 13, color: 'var(--tx)', lineHeight: 1.45, minWidth: 0 },
  propostas: { marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--bd)' },
  proposta: {
    display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '6px 0',
  },
  propostaTexto: { flex: 1, fontSize: 13, color: 'var(--tx)', lineHeight: 1.45, minWidth: 0 },
  propostaBotao: {
    flexShrink: 0, minHeight: 36, padding: '0 14px', borderRadius: 8,
    border: '1px solid rgba(0,229,160,0.4)', background: 'rgba(0,229,160,0.1)',
    color: 'var(--ac)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  propostaFeito: { flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--ac)' },
  propostaRodape: { margin: '8px 0 0', fontSize: 12, color: 'var(--mu)', lineHeight: 1.45 },
  /* Mesma forma da porta, mas é botão: abre em vez de navegar. */
  linhaAcao: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    marginTop: 20, padding: '16px', borderRadius: 12,
    border: '1px solid var(--bd)', background: 'var(--sf)',
    minHeight: 44, cursor: 'pointer', textAlign: 'left' as const,
  },
  porta: {
    display: 'flex', alignItems: 'center', gap: 12, marginTop: 24,
    padding: '16px', borderRadius: 12, border: '1px solid var(--bd)',
    background: 'var(--sf)', textDecoration: 'none', minHeight: 44,
  },
  portaTexto: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: 3, minWidth: 0 },
  portaTitulo: { fontSize: 16, fontWeight: 700, color: 'var(--tx)' },
  portaEstado: { fontSize: 13, color: 'var(--mu)' },
  portaSeta: { fontSize: 22, color: 'var(--mu)', lineHeight: 1 },
  /* O que a nota NÃO mede. Discreto: é ressalva, não manchete. */
  summaryHint: {
    fontSize: 11, lineHeight: 1.4, color: 'var(--mu)',
    margin: '0 0 6px', opacity: 0.75,
  },
  summaryScoreRow: { display: 'flex', alignItems: 'baseline', gap: 3 },
  summaryScore: {
    fontFamily: "'DM Mono', monospace", fontSize: 44, fontWeight: 700,
    lineHeight: 1, letterSpacing: '-2px', transition: 'color 0.3s',
  },
  summaryScoreMax: { fontSize: 14, color: 'var(--mu)', fontWeight: 600 },
  summaryRight: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 6,
  },
  levelBadge: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
    padding: '4px 10px', borderRadius: 6,
    fontFamily: "'DM Mono', monospace", textTransform: 'uppercase' as const,
  },
  memberChip: {
    fontSize: 11, fontWeight: 700, color: 'var(--ac2)',
    background: 'rgba(124,107,255,0.12)', border: '1px solid rgba(124,107,255,0.2)',
    borderRadius: 20, padding: '3px 10px', fontFamily: "'DM Mono', monospace",
  },
  scoreBarTrack: {
    height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3,
    overflow: 'hidden', marginBottom: 12,
  },
  scoreBarFill: {
    height: '100%', borderRadius: 3,
    transition: 'width 0.5s ease, background 0.3s',
  },
  autonomyRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  autonomyLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '1px', color: 'var(--mu)',
    textTransform: 'uppercase' as const, fontFamily: "'DM Mono', monospace",
  },
  autonomyValue: { fontSize: 13, color: 'var(--mu)', fontWeight: 600 },

  // ── Cards ─────────────────────────────────────────────────────────────────
  card: {
    background: 'var(--sf)', border: '1px solid var(--bd)',
    borderRadius: 16, padding: 16, marginBottom: 12,
    transition: 'border-color 0.2s, background 0.2s',
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardIcon: { fontSize: 18, lineHeight: 1 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: 'var(--tx)', flex: 1 },
  optionalTag: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', color: 'var(--mu)',
    textTransform: 'uppercase' as const, background: 'var(--sf2)',
    border: '1px solid var(--bd)', borderRadius: 4, padding: '2px 7px',
    fontFamily: "'DM Mono', monospace",
  },

  // Badges
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
    padding: '3px 8px', borderRadius: 5,
    fontFamily: "'DM Mono', monospace", textTransform: 'uppercase' as const,
  },
  badgeCritical: {
    background: 'rgba(255,107,107,0.15)', color: 'var(--ac3)',
    border: '1px solid rgba(255,107,107,0.3)',
  },
  badgeHigh: {
    background: 'rgba(255,179,71,0.15)', color: '#ffb347',
    border: '1px solid rgba(255,179,71,0.3)',
  },

  // Big water value
  bigValueWrap: { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 },
  bigValue: {
    fontFamily: "'DM Mono', monospace", fontSize: 48, fontWeight: 700,
    color: 'var(--ac)', lineHeight: 1, letterSpacing: '-1px',
  },
  bigValueUnit: { fontSize: 16, color: 'var(--mu)', fontWeight: 600 },
  perPersonHint: { fontSize: 12, color: 'var(--mu)', fontFamily: "'DM Mono', monospace" },

  // Battery bar
  batteryBarTrack: {
    height: 6, background: 'var(--sf2)', borderRadius: 3,
    overflow: 'hidden', marginBottom: 14, border: '1px solid var(--bd)',
  },
  batteryBarFill: {
    height: '100%', borderRadius: 3,
    transition: 'width 0.25s ease, background 0.25s ease',
  },

  // Toggles
  toggleRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, padding: '4px 0',
  },
  toggleMeta: { display: 'flex', flexDirection: 'column' as const, gap: 2, flex: 1 },
  toggleLabel: { fontSize: 14, fontWeight: 700, color: 'var(--tx)' },
  toggleDesc: { fontSize: 11, color: 'var(--mu)', lineHeight: 1.4 },
  toggle: {
    position: 'relative' as const, width: 44, height: 26, borderRadius: 13,
    border: 'none', cursor: 'pointer', flexShrink: 0,
    transition: 'background 0.2s', padding: 0,
  },
  toggleOn:       { background: 'var(--ac)' },
  toggleOff:      { background: 'var(--sf2)', outline: '1px solid var(--bd)' },
  toggleDisabled: { opacity: 0.45, cursor: 'not-allowed' as const },
  toggleThumb: {
    display: 'block', position: 'absolute' as const, top: '50%', marginTop: -10,
    width: 20, height: 20, borderRadius: '50%',
    background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    transition: 'transform 0.2s ease',
  },
  toggleDivider: { height: 1, background: 'var(--bd)', margin: '12px 0' },

  // Loading
  loadingWrap: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    justifyContent: 'center', gap: 12, minHeight: '60vh',
  },
  loadingDot: {
    display: 'block', width: 10, height: 10, borderRadius: '50%',
    background: 'var(--ac)', animation: 'blink 1.4s ease-in-out infinite',
  },
  loadingText: {
    fontSize: 13, fontWeight: 600, color: 'var(--mu)',
    fontFamily: "'DM Mono', monospace",
  },
}
