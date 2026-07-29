/**
 * Simulation debrief (D-067 / doc 19 §8, SIM-T05).
 *
 * The value of a simulator is the debrief, not the run. So this module answers
 * one question in numbers: **given that scenario, what would have run out?**
 *
 * Every gap is quantified against the household's real inventory. "Faltaram
 * 40 L de água" is actionable; "melhore suas reservas" is noise, and a family
 * that hears it twice stops listening.
 *
 * Pure and synchronous — same reasoning as the Pilot engine (D-062.1).
 */

import type { ChecklistTier } from './checklist'
import type { SimulationConfig } from './simulation'
import { reserveFactor } from './simulation'

export type GapSeverity = 'critical' | 'important' | 'advisory'

export type DebriefGap = {
  id: string
  title: string
  detail: string
  severity: GapSeverity
  /** Present when the gap can be closed by acquiring something. */
  task?: { name: string; quantity: number; unit: string | null; tier: ChecklistTier }
}

export type Debrief = {
  /** Days of self-sufficiency the scenario demanded. */
  requiredDays: number
  /** Days the household would actually have lasted. */
  survivedDays: number
  gaps: DebriefGap[]
  verdict: 'held' | 'tight' | 'failed'
}

export type DebriefInput = {
  config: SimulationConfig
  people: number
  hasInfants: boolean
  hasMedicalConditions: boolean
  mobilityImpaired: number
  /** False when the roster could not be read — never assume a household of one. */
  householdKnown: boolean
  checklistPct: number
  inventory: {
    water_liters: number
    food_days: number
    fuel_liters: number
    battery_percent: number
    has_medical_kit: boolean
    has_communication_device: boolean
  } | null
  pt: boolean
}

const LITRES_PER_PERSON_DAY = 3

/**
 * How long the scenario demands the household stand alone.
 *
 * Anchored on how long infrastructure typically stays down, not on how long the
 * weather lasts — the storm passes in hours; the power does not.
 */
function requiredDaysFor(config: SimulationConfig): number {
  const bySeverity = [0, 1, 2, 3, 5, 7][config.severity] ?? 3
  const extra = (config.powerOut ? 1 : 0) + (config.roadsBlocked ? 1 : 0)
  const floor = config.threat === 'blackout' ? 5 : config.threat === 'hurricane' ? 3 : 2
  return Math.max(floor, bySeverity + extra)
}

const round = (n: number) => Math.max(0, Math.round(n))

export function buildDebrief(input: DebriefInput): Debrief {
  const { config, people, inventory, pt } = input
  const required = requiredDaysFor(config)
  const factor = reserveFactor(config.reserves)
  const gaps: DebriefGap[] = []

  // Reserves are read through the scenario's own multiplier, so a drill run at
  // "no limite" debriefs against what the family actually had in that drill.
  const water = (inventory?.water_liters ?? 0) * factor
  const foodDays = (inventory?.food_days ?? 0) * factor
  const fuel = (inventory?.fuel_liters ?? 0) * factor
  const battery = (inventory?.battery_percent ?? 0) * factor

  const waterDays = people > 0 ? water / (LITRES_PER_PERSON_DAY * people) : 0
  const powerDays = (battery / 100) * 3
  const fuelDays = fuel / 10

  // ── Water ──
  const waterNeeded = LITRES_PER_PERSON_DAY * people * required
  if (water < waterNeeded) {
    const missing = round(waterNeeded - water)
    gaps.push({
      id: 'water',
      severity: waterDays < 1 ? 'critical' : 'important',
      title: pt ? `Faltaram ${missing} L de água` : `${missing} L of water short`,
      detail: pt
        ? `O cenário exigia ${required} dias. Com ${round(water)} L para ${people} pessoa(s), a água durava ${waterDays.toFixed(1)} dias.`
        : `The scenario demanded ${required} days. With ${round(water)} L for ${people} person(s), water lasted ${waterDays.toFixed(1)} days.`,
      task: {
        name: pt ? 'Água potável armazenada' : 'Stored drinking water',
        quantity: missing,
        unit: 'L',
        tier: 'ESSENTIAL',
      },
    })
  }

  // ── Food ──
  if (foodDays < required) {
    const missing = Math.max(1, round(required - foodDays))
    gaps.push({
      id: 'food',
      severity: foodDays < 1 ? 'critical' : 'important',
      title: pt ? `Faltaram ${missing} dia(s) de comida` : `${missing} day(s) of food short`,
      detail: pt
        ? `Havia comida para ${foodDays.toFixed(1)} dias e o cenário exigia ${required}.`
        : `There was food for ${foodDays.toFixed(1)} days and the scenario demanded ${required}.`,
      task: {
        name: pt ? 'Comida não perecível' : 'Non-perishable food',
        quantity: missing,
        unit: pt ? 'dias' : 'days',
        tier: 'ESSENTIAL',
      },
    })
  }

  // ── Power, and it matters more when the scenario cut it ──
  if (config.powerOut && powerDays < required) {
    gaps.push({
      id: 'power',
      severity: powerDays < 1 ? 'critical' : 'important',
      title: pt ? 'Energia acabaria antes do fim' : 'Power would run out first',
      detail: pt
        ? `Com a rede caída, a reserva durava ${powerDays.toFixed(1)} dias contra ${required} exigidos.`
        : `With the grid down, stored power lasted ${powerDays.toFixed(1)} days against ${required} required.`,
      task: { name: pt ? 'Bateria portátil / gerador' : 'Power bank / generator', quantity: 1, unit: null, tier: 'ESSENTIAL' },
    })
  }

  // ── Fuel, and it matters more when the roads were open to leave ──
  if (!config.roadsBlocked && fuelDays < 2) {
    gaps.push({
      id: 'fuel',
      severity: 'important',
      title: pt ? 'Combustível curto para sair' : 'Not enough fuel to leave',
      detail: pt
        ? `Havia ${round(fuel)} L. As vias estavam abertas neste cenário — sair era possível, e a autonomia de combustível era de ${fuelDays.toFixed(1)} dias.`
        : `There were ${round(fuel)} L. Roads were open in this scenario — leaving was possible, and fuel autonomy was ${fuelDays.toFixed(1)} days.`,
      task: { name: pt ? 'Combustível de reserva' : 'Reserve fuel', quantity: 20, unit: 'L', tier: 'MODERATE' },
    })
  }

  // ── Comms: the scenario took the network away ──
  if (config.networkDown && !inventory?.has_communication_device) {
    gaps.push({
      id: 'comms',
      severity: 'critical',
      title: pt ? 'Sem rádio, e sem rede no cenário' : 'No radio, and no network in the scenario',
      detail: pt
        ? 'O celular ficou mudo e não havia rádio. A família teria perdido contato e não receberia aviso oficial.'
        : 'The phone went silent and there was no radio. The family would have lost contact and any official warning.',
      task: { name: pt ? 'Rádio a pilha (NOAA/AM-FM)' : 'Battery radio (NOAA/AM-FM)', quantity: 1, unit: null, tier: 'ESSENTIAL' },
    })
  }

  // ── Medical ──
  if ((config.medicalNeed || input.hasMedicalConditions) && !inventory?.has_medical_kit) {
    gaps.push({
      id: 'medical',
      severity: 'critical',
      title: pt ? 'Sem kit médico com alguém dependendo dele' : 'No medical kit with someone depending on it',
      detail: pt
        ? 'O cenário incluía necessidade de medicação e não havia kit registrado no inventário.'
        : 'The scenario included a medication need and no kit was recorded in the inventory.',
      task: { name: pt ? 'Kit médico com medicação de uso contínuo' : 'Medical kit with ongoing medication', quantity: 1, unit: null, tier: 'ESSENTIAL' },
    })
  }

  // ── Mobility: a plan issue, not a shopping one ──
  if (config.mobilityLimited || input.mobilityImpaired > 0) {
    gaps.push({
      id: 'mobility',
      severity: 'advisory',
      title: pt ? 'Alguém não conseguia se deslocar sozinho' : 'Someone could not move unaided',
      detail: pt
        ? 'Isso não se resolve comprando: precisa estar escrito no plano da família quem busca quem, e por qual caminho.'
        : 'This is not solved by buying: the family plan has to say who collects whom, and by which route.',
    })
  }

  if (input.hasInfants) {
    gaps.push({
      id: 'infants',
      severity: 'advisory',
      title: pt ? 'Há bebê na casa' : 'There is an infant at home',
      detail: pt
        ? 'Fórmula, fraldas e água para preparo entram na conta e acabam antes do resto.'
        : 'Formula, nappies and water for preparation are part of the maths and run out before everything else.',
    })
  }

  // A debrief that quietly assumed one person would understate every number on
  // this screen. Say it instead — same rule as the Pilot (D-062.1).
  if (!input.householdKnown) {
    gaps.push({
      id: 'roster',
      severity: 'important',
      title: pt ? 'Contei com 1 pessoa' : 'I counted one person',
      detail: pt
        ? 'Não consegui ler a ficha da família, então as contas acima valem para uma pessoa só. Com mais gente, todas as faltas aumentam proporcionalmente.'
        : 'I could not read the family record, so the maths above is for one person. With more people every shortfall grows proportionally.',
    })
  }

  if (input.checklistPct < 100) {
    gaps.push({
      id: 'checklist',
      severity: input.checklistPct < 50 ? 'important' : 'advisory',
      title: pt ? `Checklist em ${input.checklistPct}%` : `Checklist at ${input.checklistPct}%`,
      detail: pt
        ? 'O que está na lista e não foi adquirido é exatamente o que faltaria nesta situação.'
        : 'Whatever is on the list and not acquired is exactly what would have been missing here.',
    })
  }

  const survived = inventory
    ? Math.max(0, Math.min(waterDays, foodDays, config.powerOut ? powerDays : Infinity))
    : 0

  return {
    requiredDays: required,
    survivedDays: Number.isFinite(survived) ? survived : 0,
    gaps,
    verdict: survived >= required ? 'held' : survived >= required * 0.6 ? 'tight' : 'failed',
  }
}
