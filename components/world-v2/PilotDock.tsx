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

import { useCallback, useEffect, useState } from 'react'
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
      <button
        type="button"
        className="wv2-dock-orb"
        data-state={risk.state}
        aria-label={pt ? 'Abrir o Pilot, seu especialista EOS' : 'Open the Pilot, your EOS specialist'}
        onClick={() => { haptic.impact(); setOpen(true) }}
      >
        <span className="core" aria-hidden="true" />
      </button>

      <div className="wv2" data-risk={risk.state}>
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
