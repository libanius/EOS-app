'use client'

/**
 * "O que falta" — os requisitos da família (PREP-T07 fase 1 / D-164).
 *
 * Extraída da Preparação, onde vivia no fim de uma rolagem de 1600 linhas,
 * atrás de seis editores numéricos. Três tempos de uso diferentes estavam
 * empilhados na mesma tela: diagnóstico (leitura), estoque (manutenção mensal)
 * e esta lista (uma sessão de compra). A mais lenta ficava entre a pessoa e a
 * mais urgente.
 *
 * ── O que muda de verdade aqui ─────────────────────────────────────────────
 *
 * O KIT vira **filtro**, não rótulo. Antes, `kit_type` aparecia como texto
 * ("Fonte: Bug Out") no rodapé do item, e a lista era plana por tier — dois
 * itens com o mesmo nome, um embaixo do outro, e nada dizia qual mochila você
 * estava editando. O eixo sempre existiu no banco (`docs/37` §3, defeito S3) e
 * estava desligado na interface.
 *
 * A PROCEDÊNCIA vira **selo**. `EDU_CONTENT`, `PILOT_RECOMMENDATION` e
 * `SIMULATION_DEBRIEF` nunca foram kits: são de onde a sugestão veio. Ficavam
 * na mesma coluna por falta de lugar, e `splitKitType()` (D-161) desfaz isso.
 *
 * ── Sem fusão de linhas, de propósito ──────────────────────────────────────
 *
 * `projectLegacyChecklist()` sabe fundir duplicatas, mas NÃO é usada aqui. A
 * API opera linha a linha — `toggle` por `canonical_key`, `PATCH`/`DELETE` por
 * id — e uma linha fundida não tem id único para editar. Fundir é trabalho do
 * backfill (estágio 4 de `docs/37` §28), não da interface. Uma tela que mostra
 * menos linhas do que consegue editar é uma tela que perde toques.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { useLanguage } from '@/lib/i18n'
import { splitKitType, type Provenance } from '@/lib/requirements'
import { countsInProgress, statusFromLegacy, type AcquisitionStatus } from '@/lib/acquisition'
import PreparednessNav from './PreparednessNav'
import { ChecklistEditDialog, ConfirmDialog, type ChecklistItem, type ChecklistTier } from './ChecklistDialogs'

const TIERS: ChecklistTier[] = ['ESSENTIAL', 'MODERATE', 'EXCELLENT']
const TIER_DAYS: Record<ChecklistTier, number> = { ESSENTIAL: 3, MODERATE: 7, EXCELLENT: 30 }
const TIER_COLOR: Record<ChecklistTier, string> = {
  ESSENTIAL: '#ef4444',
  MODERATE: '#f59e0b',
  EXCELLENT: '#22c55e',
}

/** Nome de exibição dos kits. `null` = linha de base da casa (D-161). */
const KIT_NAME: Record<string, { pt: string; en: string; icon: string }> = {
  BUG_OUT: { pt: 'Bug Out', en: 'Bug Out', icon: '🎒' },
  ACAMPAMENTO: { pt: 'Acampamento', en: 'Camping', icon: '🏕' },
  PESCA: { pt: 'Pesca', en: 'Fishing', icon: '🎣' },
  CACA: { pt: 'Caça', en: 'Hunting', icon: '🦌' },
}

const PROVENANCE_LABEL: Record<Provenance, { pt: string; en: string }> = {
  MANUAL: { pt: 'Você', en: 'You' },
  PILOT: { pt: 'Pilot', en: 'Pilot' },
  EDU: { pt: 'EDU', en: 'EDU' },
  SIMULATION: { pt: 'Treino', en: 'Drill' },
  OFFICIAL_ALERT: { pt: 'Alerta', en: 'Alert' },
  PLAN_GAP: { pt: 'Plano', en: 'Plan' },
}

/** Chave do filtro: `null` = todos; `'BASE'` = casa; senão o slug do kit. */
type Filtro = null | 'BASE' | string

export default function RequirementsPage() {
  const { language, t } = useLanguage()
  const pt = language === 'pt'

  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>(null)
  const [editando, setEditando] = useState<ChecklistItem | null>(null)
  const [excluindo, setExcluindo] = useState<ChecklistItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/checklist', { cache: 'no-store' })
      if (res.ok) {
        const { items: rows } = await res.json()
        setItems(Array.isArray(rows) ? rows : [])
      }
    } catch {
      /* A lista some; a navegação continua. */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useRealtimeSync(['checklists'], () => { void load() })

  /**
   * Cada item com suas duas dimensões e o estado.
   *
   * Depois do cutover (D-176) a API manda `kit_slug` e `provenance` SEPARADOS e
   * exatos. `splitKitType` fica como retaguarda para resposta antiga em cache —
   * o service worker pode servir a forma de ontem por alguns minutos.
   */
  const separados = useMemo(
    () => items.map(item => ({
      item,
      ...(item.provenance
        ? { kitSlug: item.kit_slug ?? null, provenance: item.provenance }
        : splitKitType(item.kit_type)),
      // Deriva do booleano enquanto a coluna nova não existir no banco: a tela
      // nunca fica sem estado, e a migração pode chegar depois do deploy.
      status: (item.status ?? statusFromLegacy(item.acquired)) as AcquisitionStatus,
    })),
    [items],
  )

  /** Os kits que a família realmente usa — não a lista teórica. */
  const kitsEmUso = useMemo(() => {
    const slugs = new Set<string>()
    let temBase = false
    for (const { kitSlug } of separados) {
      if (kitSlug) slugs.add(kitSlug)
      else temBase = true
    }
    return { slugs: Array.from(slugs).sort(), temBase }
  }, [separados])

  const visiveis = useMemo(() => {
    if (filtro === null) return separados
    if (filtro === 'BASE') return separados.filter(s => s.kitSlug === null)
    return separados.filter(s => s.kitSlug === filtro)
  }, [separados, filtro])

  const toggle = useCallback(async (canonicalKey: string, next: boolean) => {
    setItems(prev => prev.map(i => i.canonical_key === canonicalKey ? { ...i, acquired: next } : i))
    try {
      const res = await fetch('/api/checklist/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalKey, acquired: next }),
      })
      if (!res.ok) throw new Error('toggle failed')
    } catch {
      setItems(prev => prev.map(i => i.canonical_key === canonicalKey ? { ...i, acquired: !next } : i))
    }
    /*
     * D-156: marcar NÃO escreve no estoque da casa. A regra e o porquê estão
     * em `lib/checklist-inventory.ts`, com teste.
     */
  }, [])

  const gerar = useCallback(async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/checklist/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioType: 'GENERAL' }),
      })
      if (res.ok) await load()
    } finally {
      setGenerating(false)
    }
  }, [load])

  const remover = useCallback(async (item: ChecklistItem) => {
    setItems(prev => prev.filter(i => i.id !== item.id))
    setExcluindo(null)
    try {
      const res = await fetch(`/api/checklist/${item.id}`, { method: 'DELETE' })
      if (!res.ok) await load()
    } catch {
      await load()
    }
  }, [load])

  /**
   * "Não se aplica a esta casa" (D-171).
   *
   * Antes, quem não precisava de um item só podia APAGÁ-LO — e a próxima
   * geração de checklist o trazia de volta. Apagar diz "some da tela";
   * descartar diz "esta família não precisa disto", e o app tem obrigação de
   * lembrar de uma decisão sobre a própria casa.
   */
  const mudarStatus = useCallback(async (item: ChecklistItem, status: AcquisitionStatus) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status, acquired: status === 'met' } : i))
    try {
      const res = await fetch(`/api/checklist/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) await load()
    } catch {
      await load()
    }
  }, [load])

  /** Editar item — nome, quantidade, unidade e tier (D-121, preservado). */
  const salvarEdicao = useCallback(async (
    item: ChecklistItem,
    patch: Pick<ChecklistItem, 'item_name' | 'quantity' | 'unit' | 'tier'>,
  ) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i))
    setEditando(null)
    try {
      const res = await fetch(`/api/checklist/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) await load()
      else {
        const data = await res.json().catch(() => ({}))
        // O servidor recalcula `canonical_key` quando o nome muda (D-121);
        // reler a linha dele evita que a UI fique com a chave velha e o
        // próximo toque no checkbox erre o alvo.
        if (data.item) setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...data.item } : i))
      }
    } catch {
      await load()
    }
  }, [load])

  const nomeDoKit = (slug: string) => {
    const conhecido = KIT_NAME[slug]
    if (conhecido) return `${conhecido.icon} ${pt ? conhecido.pt : conhecido.en}`
    // Kit criado pelo usuário: todo kit é Preparação (D-157), inclusive os que
    // não conhecemos — mostrar o slug é melhor que esconder o item.
    return `📦 ${slug.replace(/_/g, ' ').toLowerCase()}`
  }

  return (
    <div style={S.page}>
      <div style={S.width}>
        <div style={S.header}>
          <div>
            <p style={S.eyebrow}>{t('inventory.preparedness')}</p>
            <h1 style={S.title}>{pt ? 'O que falta' : 'What’s missing'}</h1>
          </div>
          {items.length === 0 && !loading && (
            <button type="button" onClick={gerar} disabled={generating} style={S.gerar}>
              {generating ? t('checklist.generating') : t('inventory.generateChecklist')}
            </button>
          )}
        </div>

        {/* Mesma ordem da Visão: título, depois seções (D-164). */}
        <PreparednessNav />

        {/*
          Filtro por kit. Só aparece quando há mais de um grupo: um filtro com
          uma opção só é ruído que ocupa a primeira dobra.
        */}
        {(kitsEmUso.slugs.length > 0 && (kitsEmUso.temBase || kitsEmUso.slugs.length > 1)) && (
          <div style={S.filtros} role="group" aria-label={pt ? 'Filtrar por kit' : 'Filter by kit'}>
            <Chip on={filtro === null} onClick={() => setFiltro(null)}>{pt ? 'Tudo' : 'All'}</Chip>
            {kitsEmUso.temBase && (
              <Chip on={filtro === 'BASE'} onClick={() => setFiltro('BASE')}>{pt ? '🏠 Em casa' : '🏠 At home'}</Chip>
            )}
            {kitsEmUso.slugs.map(slug => (
              <Chip key={slug} on={filtro === slug} onClick={() => setFiltro(slug)}>{nomeDoKit(slug)}</Chip>
            ))}
          </div>
        )}

        {loading ? (
          <p style={S.vazio}>{t('inventory.loading')}</p>
        ) : visiveis.length === 0 ? (
          <p style={S.vazio}>{items.length === 0 ? t('inventory.emptyChecklist') : (pt ? 'Nada neste kit.' : 'Nothing in this kit.')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {TIERS.map(tier => {
              const doTier = visiveis.filter(s => s.item.tier === tier)
              if (!doTier.length) return null
              /*
               * O denominador ignora o descartado (D-171). Um checklist de 10
               * onde 3 não se aplicam é um checklist de 7 — mostrar 7/10 para
               * sempre ensinaria que a barra nunca fecha.
               */
              const naConta = doTier.filter(s => countsInProgress(s.status))
              const feitos = naConta.filter(s => s.item.acquired).length
              const base = naConta.length || 1
              const pct = Math.round((feitos / base) * 100)
              const dias = Math.round((feitos / base) * TIER_DAYS[tier])

              return (
                <div key={tier} style={S.grupo}>
                  <div style={S.grupoTopo}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: TIER_COLOR[tier], flexShrink: 0 }} />
                    <span style={{ ...S.tierNome, color: TIER_COLOR[tier] }}>
                      {tier === 'ESSENTIAL' ? t('checklist.essential') : tier === 'MODERATE' ? t('checklist.moderate') : t('checklist.excellent')}
                    </span>
                    <div style={S.barraTrilho}>
                      <div style={{ width: `${pct}%`, height: '100%', background: TIER_COLOR[tier], transition: 'width .3s' }} />
                    </div>
                    <span style={S.contagem}>{feitos}/{naConta.length} · ~{dias}d</span>
                  </div>

                  {doTier.map(({ item, kitSlug, provenance, status }) => (
                    <div key={item.id} style={{ ...S.linha, opacity: status === 'not_applicable' ? 0.45 : 1 }}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={item.acquired}
                        aria-label={item.item_name}
                        onClick={() => toggle(item.canonical_key, !item.acquired)}
                        style={{
                          ...S.caixa,
                          border: `1.5px solid ${item.acquired ? TIER_COLOR[item.tier] : 'var(--bd)'}`,
                          background: item.acquired ? TIER_COLOR[item.tier] : 'transparent',
                        }}
                      >
                        {item.acquired && (
                          <svg viewBox="0 0 10 10" width="11" height="11" aria-hidden>
                            <polyline points="1.5,5 4,7.5 8.5,2.5" fill="none" stroke="#0a0a0f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>

                      <span style={S.corpo}>
                        <span style={{ ...S.nome, color: item.acquired ? 'var(--mu)' : 'var(--tx)', textDecoration: item.acquired ? 'line-through' : 'none' }}>
                          {item.item_name}
                        </span>

                        <span style={S.selos}>
                          <span style={S.qtd}>{item.quantity}{item.unit ? ` ${item.unit}` : ''}</span>
                          {status === 'not_applicable' && (
                            <button type="button" onClick={() => mudarStatus(item, 'needed')} style={{ ...S.selo, cursor: 'pointer' }}>
                              {pt ? 'não se aplica · desfazer' : 'not applicable · undo'}
                            </button>
                          )}
                          {/* Kit só quando o filtro não o torna óbvio. */}
                          {kitSlug && filtro === null && <span style={S.selo}>{nomeDoKit(kitSlug)}</span>}
                          {/* Procedência: de onde veio a sugestão, não um kit. */}
                          {provenance !== 'MANUAL' && (
                            <span style={{ ...S.selo, ...S.seloOrigem }}>
                              {pt ? 'via ' : 'via '}{PROVENANCE_LABEL[provenance][pt ? 'pt' : 'en']}
                            </span>
                          )}
                        </span>
                      </span>

                      <span style={S.acoes}>
                      {status !== 'not_applicable' && (
                        <button
                          type="button"
                          aria-label={`${pt ? 'Não se aplica' : 'Not applicable'}: ${item.item_name}`}
                          title={pt ? 'Não se aplica a esta casa' : 'Not applicable to this household'}
                          onClick={() => mudarStatus(item, 'not_applicable')}
                          style={S.acao}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                            <path d="M6 18 18 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`${pt ? 'Editar' : 'Edit'} ${item.item_name}`}
                        onClick={() => setEditando(item)}
                        style={S.acao}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
                          <path d="M4 20h4.8L19 9.8 14.2 5 4 15.2V20Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                          <path d="m13 6 5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        aria-label={`${pt ? 'Excluir' : 'Delete'} ${item.item_name}`}
                        onClick={() => setExcluindo(item)}
                        style={S.acao}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
                          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                        </svg>
                      </button>
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>

      {editando && (
        <ChecklistEditDialog
          item={editando}
          language={language}
          onCancel={() => setEditando(null)}
          onSave={patch => salvarEdicao(editando, patch)}
        />
      )}
      {excluindo && (
        <ConfirmDialog
          title={pt ? 'Excluir item?' : 'Delete item?'}
          body={excluindo.item_name}
          confirm={pt ? 'Excluir' : 'Delete'}
          cancel={pt ? 'Cancelar' : 'Cancel'}
          destructive
          onCancel={() => setExcluindo(null)}
          onConfirm={() => remover(excluindo)}
        />
      )}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} style={{ ...S.chip, ...(on ? S.chipOn : null) }}>
      {children}
    </button>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { flex: 1, overflowY: 'auto', padding: '0 16px 100px', background: 'var(--bg)', minHeight: '100dvh' },
  width: { maxWidth: 600, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  eyebrow: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--mu)', margin: 0 },
  title: { fontSize: 24, fontWeight: 700, color: 'var(--tx)', margin: '4px 0 0' },
  gerar: {
    flexShrink: 0, minHeight: 44, padding: '0 16px', background: 'var(--ac)', color: '#0a0a0f',
    border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer',
  },
  filtros: { display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 12 },
  chip: {
    flexShrink: 0, minHeight: 40, padding: '0 12px', borderRadius: 999,
    border: '1px solid var(--bd)', background: 'var(--sf)', color: 'var(--mu)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  chipOn: { borderColor: 'rgba(0,229,160,0.45)', background: 'rgba(0,229,160,0.12)', color: 'var(--tx)', fontWeight: 800 },
  vazio: { padding: '32px 0', textAlign: 'center', color: 'var(--mu)', fontSize: 14 },
  grupo: { border: '1px solid var(--bd)', borderRadius: 12, overflow: 'hidden', background: 'var(--sf)' },
  grupoTopo: { padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--bd)' },
  tierNome: { fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' },
  barraTrilho: { flex: 1, height: 4, background: 'var(--sf2)', borderRadius: 2, overflow: 'hidden', marginLeft: 4 },
  contagem: { fontSize: 12, color: 'var(--mu)', fontFamily: 'ui-monospace,Menlo,monospace', flexShrink: 0 },
  linha: {
    display: 'grid', gridTemplateColumns: '20px minmax(0,1fr) auto', alignItems: 'flex-start', gap: 12,
    padding: '11px 16px', borderBottom: '1px solid var(--bd)',
  },
  caixa: {
    width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 2, padding: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  corpo: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  nome: { fontSize: 14 },
  selos: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  qtd: { fontSize: 12, color: 'var(--mu)', fontFamily: 'ui-monospace,Menlo,monospace' },
  selo: {
    fontSize: 11, padding: '2px 8px', borderRadius: 999,
    border: '1px solid var(--bd)', color: 'var(--mu)', whiteSpace: 'nowrap',
  },
  seloOrigem: { borderColor: 'rgba(0,229,160,0.28)', color: 'rgba(0,229,160,0.85)' },
  acoes: { display: 'flex', alignItems: 'flex-start', gap: 2, flexShrink: 0 },
  acao: {
    width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', color: 'var(--mu)', cursor: 'pointer', padding: 0,
  },
}
