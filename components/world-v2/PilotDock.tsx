'use client'

/**
 * PilotDock — o Pilot alcançável de QUALQUER tela (D-079).
 *
 * Ele vivia só no dashboard, porque só lá o `RiskProvider` estava montado. Na
 * prática isso significava que a pessoa precisava voltar para casa para poder
 * perguntar — exatamente o oposto de um copiloto. Agora o provedor de risco vive
 * no layout autenticado e este dock põe o orbe em cima de tudo.
 *
 * O CONTEXTO É MONTADO SOB DEMANDA. Inventário, checklist, ficha da família,
 * abrigos e ciclones só são buscados quando o orbe é aberto. Um app de
 * emergência não pode cobrar cinco requisições de rede e bateria em toda tela
 * por uma conversa que talvez não aconteça — e quando ela acontece, a espera de
 * um segundo é invisível dentro da digitação.
 *
 * No dashboard o dock não aparece: lá a entrada é a PilotBar, que já é o orbe
 * mais o campo de busca (D-070). Dois orbes na mesma tela seriam dois caminhos
 * para a mesma coisa.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n'
import { useRisk } from '@/components/v2/RiskProvider'
import { useSimulation } from '@/components/SimulationProvider'
import { SOURCE_LABELS, isSourceDown } from '@/lib/simulation'
import { isRelevant, type CycloneSnapshot } from '@/lib/world/cyclones'
import type { WindSnapshot } from '@/lib/world/wind'
import Pilot from './Pilot'
import type { PilotContext } from './pilot-engine'
import { haptic } from './motion'
import './world-v2.css'
import PilotOrb from './PilotOrb'

/** Telas que já oferecem o Pilot por conta própria. */
const HAS_OWN_PILOT = ['/dashboard', '/dashboard-world']

type Member = { is_infant?: boolean; age?: number; medical_conditions?: unknown[]; mobility_impaired?: boolean }

export default function PilotDock() {
  const pathname = usePathname()
  const { language } = useLanguage()
  const pt = language === 'pt'
  const risk = useRisk()
  const simulation = useSimulation()

  const [open, setOpen] = useState(false)

  /**
   * Onde o orbe fica, decidido pelo usuário (D-079).
   *
   * Um botão fixo num canto atrapalha alguém: canhoto, tela grande, lista cujo
   * conteúdo importante mora justamente ali. Em vez de eu escolher o canto certo
   * — que não existe —, ele é arrastável e fica onde for solto.
   *
   * Guardado em fração da tela, não em pixels: o mesmo aparelho girado, ou uma
   * janela redimensionada, jogaria um valor em pixels para fora da vista.
   */
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const orbRef = useRef<HTMLButtonElement | null>(null)
  const dragState = useRef<{ id: number; dx: number; dy: number; moved: boolean } | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('eos-pilot-orb')
      if (stored) {
        const parsed = JSON.parse(stored) as { x: number; y: number }
        if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) setSpot(parsed)
      }
    } catch { /* private mode ou valor velho */ }
  }, [])
  const [loaded, setLoaded] = useState(false)
  const [extra, setExtra] = useState<{
    household: PilotContext['household']
    inventory: PilotContext['inventory']
    checklistPct: number
    cyclones: PilotContext['cyclones']
    wind: PilotContext['wind']
  } | null>(null)

  /** Uma vez por sessão de tela: o que o Pilot precisa saber para instruir. */
  const load = useCallback(async () => {
    if (loaded) return
    setLoaded(true)
    const coords = risk.coords

    const [inv, fam, chk, cyc, wnd] = await Promise.all([
      fetch('/api/inventory').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/family-members').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/checklist').then(r => (r.ok ? r.json() : null)).catch(() => null),
      coords
        ? fetch(`/api/world/cyclones?lat=${coords.lat}&lng=${coords.lng}`).then(r => (r.ok ? r.json() : null)).catch(() => null)
        : null,
      coords
        ? fetch(`/api/world/wind?lat=${coords.lat}&lng=${coords.lng}`).then(r => (r.ok ? r.json() : null)).catch(() => null)
        : null,
    ])

    const members: Member[] = Array.isArray(fam?.members) ? fam.members : []
    const items: Array<{ acquired: boolean }> = chk?.items ?? []
    const snapshot = cyc as CycloneSnapshot | null
    const windSnap = wnd as WindSnapshot | null

    setExtra({
      household: {
        // Nunca assumir uma pessoa: uma casa contada a menos subestima toda
        // conta de água e comida que o Pilot fizer (mesma regra do debrief).
        people: Math.max(1, members.length),
        hasInfants: members.some(m => m.is_infant === true || (typeof m.age === 'number' && m.age < 2)),
        hasMedicalConditions: members.some(m => Array.isArray(m.medical_conditions) && m.medical_conditions.length > 0),
        mobilityImpaired: members.filter(m => m.mobility_impaired === true).length,
        known: members.length > 0,
      },
      inventory: inv?.inventory ?? null,
      checklistPct: items.length ? Math.round((items.filter(i => i.acquired).length / items.length) * 100) : 0,
      cyclones: (snapshot?.storms ?? []).map(s => ({
        name: s.name,
        classification: s.classification,
        windKmh: s.windKmh,
        distanceKm: s.distanceKm,
        headingDeg: s.headingDeg,
        speedKmh: s.speedKmh,
        relevant: isRelevant(s),
      })),
      wind: windSnap?.atUser
        ? { speedKmh: windSnap.atUser.speedKmh, gustKmh: windSnap.atUser.gustKmh, fromDeg: windSnap.atUser.fromDeg }
        : null,
    })
  }, [loaded, risk.coords])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  if (HAS_OWN_PILOT.some(route => pathname?.startsWith(route))) return null

  const SIZE = 56
  const MARGIN = 12

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    dragState.current = {
      id: event.pointerId,
      // Respeita ONDE o dedo pegou: puxar para o centro do botão no primeiro
      // movimento é o salto que denuncia um arrasto mal feito.
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current
    if (!drag || drag.id !== event.pointerId) return
    const left = event.clientX - drag.dx
    const top = event.clientY - drag.dy
    // Histerese: sem ela, o tremor natural do dedo transformaria todo toque em
    // arrasto e o orbe nunca abriria o Pilot.
    if (!drag.moved) {
      const rect = event.currentTarget.getBoundingClientRect()
      if (Math.abs(left - rect.left) + Math.abs(top - rect.top) < 8) return
      drag.moved = true
      setDragging(true)
    }
    const maxX = window.innerWidth - SIZE - MARGIN
    const maxY = window.innerHeight - SIZE - MARGIN
    setSpot({
      x: Math.min(Math.max(left, MARGIN), Math.max(MARGIN, maxX)) / window.innerWidth,
      y: Math.min(Math.max(top, MARGIN), Math.max(MARGIN, maxY)) / window.innerHeight,
    })
  }

  const onPointerUp = () => {
    const drag = dragState.current
    dragState.current = null
    setDragging(false)
    if (!drag) return
    if (drag.moved) {
      haptic.selection()
      try { localStorage.setItem('eos-pilot-orb', JSON.stringify(spot)) } catch { /* private mode */ }
      return
    }
    // Não houve arrasto: foi um toque, e toque abre o Pilot.
    haptic.impact()
    setOpen(true)
  }

  const placement = spot
    ? { left: `${(spot.x * 100).toFixed(2)}%`, top: `${(spot.y * 100).toFixed(2)}%`, right: 'auto', bottom: 'auto' }
    : undefined

  const days = (value: number | null | undefined) => (typeof value === 'number' ? value : 0)

  const ctx: PilotContext = {
    pt,
    riskState: risk.state,
    score: risk.score,
    snapshot: risk.snapshot,
    // O RiskProvider não tem um campo `online`; o que ele sabe é se a última
    // leitura falhou. Um erro de leitura é a definição prática de "sem dado",
    // que é o que o Pilot precisa declarar em vez de fingir que sabe.
    online: !risk.error,
    hasCoords: risk.hasCoords,
    household: extra?.household ?? { people: 1, hasInfants: false, hasMedicalConditions: false, mobilityImpaired: 0, known: false },
    inventory: extra?.inventory ?? null,
    checklistPct: extra?.checklistPct ?? 0,
    // Sem inventário lido, autonomia é ZERO e não um palpite: o Pilot precisa
    // dizer "não sei" em vez de inventar dias que a família não tem.
    waterDays: days(extra?.inventory ? extra.inventory.water_liters / (3 * (extra.household.people || 1)) : 0),
    foodDays: days(extra?.inventory?.food_days),
    powerDays: days(extra?.inventory ? (extra.inventory.battery_percent / 100) * 3 : 0),
    fuelDays: days(extra?.inventory ? extra.inventory.fuel_liters / 10 : 0),
    autonomyDays: days(extra?.inventory?.food_days),
    nearestShelter: null,
    sheltersKnown: false,
    simulated: simulation.active,
    downSources: simulation.config
      ? SOURCE_LABELS.filter(x => isSourceDown(simulation.config, x.key)).map(x => (pt ? x.pt : x.en))
      : [],
    locationLabel: risk.hasCoords ? (pt ? 'Sua área' : 'Your area') : null,
    coords: risk.coords,
    cyclones: extra?.cyclones ?? [],
    wind: extra?.wind ?? null,
  }

  return (
    <>
      {/*
        O MESMO orbe da PilotBar — agora de verdade (D-136).
        
        Este comentário já dizia "o mesmo orbe" e não era: aqui havia 56px de
        círculo com borda própria, ícone de 24px, brilho de 8px e a cor mudando
        com o risco; lá, 46px de pílula de vidro esfumaçado, ícone de 22px,
        sempre verde. Um comentário que afirma o que o código não faz é pior que
        nenhum, porque quem lê para de conferir.

        Agora os dois montam `PilotOrb`. O que sobra aqui é só o LUGAR: fixo,
        arrastável, acima da navegação.
      */}
      <PilotOrb
        ref={orbRef}
        className={`wv2-dock-orb${dragging ? ' dragging' : ''}`}
        riskState={risk.state}
        style={placement}
        label={pt ? 'Abrir o Pilot, seu especialista EOS. Arraste para mover.' : 'Open the Pilot, your EOS specialist. Drag to move.'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/*
        `wv2-portal` é OBRIGATÓRIO aqui.

        A classe `.wv2` sozinha é a casca do dashboard: `position: fixed`,
        `inset: 0`, fundo preto. Ela existe para OCUPAR a tela inteira. Usá-la só
        para herdar os tokens de cor pintou uma cortina preta sobre todas as
        páginas — o app inteiro ficou preto menos as duas telas que já tinham
        casca própria. O portal mantém as variáveis e devolve o layout.
      */}
      <div className="wv2 wv2-portal" data-risk={risk.state} data-eos-pilot-dock="">
        <Pilot
          ctx={ctx}
          online={!risk.error}
          open={open}
          onOpenChange={setOpen}
          incoming={null}
          // Fora do dashboard não existe mapa do EOS para desenhar o trajeto, e
          // fingir que existe seria pior. O Pilot ainda entrega o destino e o
          // deep-link para o app de mapas.
          onShowCourse={() => {}}
        />
      </div>
    </>
  )
}
