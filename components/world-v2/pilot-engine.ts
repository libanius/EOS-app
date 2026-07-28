'use client'

/**
 * Pilot engine — the EOS decision copilot.
 *
 * ARCHITECTURAL RULE: this module is pure, synchronous and offline. When things
 * get bad, the network is usually the first thing to fail, so the answer that
 * matters most must never depend on a round trip. Every response below is
 * computed from data already in the client: the risk state machine, the weather
 * snapshot, the household roster, the inventory and the checklist.
 *
 * A model-backed layer can enrich these answers later (see /api/ai/readiness),
 * but it must remain strictly additive — never the thing that decides.
 *
 * Household rules come from the canonical EOS RulesEngine so the Pilot and the
 * rest of the app cannot disagree about what "low on water" means.
 */

import { RulesEngine } from '@/lib/rules-engine'
import { UrgencyLevel } from '@/lib/types'
import type { WeatherSnapshot } from '@/lib/weather/types'
import type { Household } from './useWorldData'

export type PilotVerdict = 'ready' | 'watch' | 'hold' | 'act'
export type PilotIntentId = 'now' | 'stay_or_go' | 'endurance' | 'gaps' | 'outside'

export type PilotAction = { label: string; href: string; primary?: boolean }

export type PilotAnswer = {
  intent: PilotIntentId
  verdict: PilotVerdict
  /** The answer itself, in one line. Never a preamble. */
  headline: string
  body: string
  factors: Array<{ label: string; value: string }>
  actions: PilotAction[]
  /** Shown verbatim when the Pilot is reasoning without part of the picture. */
  caveat?: string
}

export type PilotContext = {
  pt: boolean
  riskState: 'safe' | 'watch' | 'warning' | 'critical'
  score: number | null
  snapshot: WeatherSnapshot | null
  online: boolean
  hasCoords: boolean
  household: Household
  inventory: {
    water_liters: number
    food_days: number
    fuel_liters: number
    battery_percent: number
    has_medical_kit: boolean
    has_communication_device: boolean
  } | null
  checklistPct: number
  waterDays: number
  foodDays: number
  powerDays: number
  fuelDays: number
  autonomyDays: number
  /** Nearest OFFICIAL open shelter (D-065), or null when none is open nearby. */
  nearestShelter: { name: string; distanceKm: number } | null
  /** False until the FEMA lookup answered — "I don't know" is not "there is none". */
  sheltersKnown: boolean
  /** True while a training simulation is running (D-067). */
  simulated?: boolean
  /** Human-readable place, so the Pilot can name where it is talking about. */
  locationLabel?: string | null
}

export const PILOT_INTENTS: Array<{ id: PilotIntentId; pt: string; en: string }> = [
  { id: 'now', pt: 'O que eu faço agora?', en: 'What do I do now?' },
  { id: 'stay_or_go', pt: 'Ficar ou sair?', en: 'Stay or go?' },
  { id: 'endurance', pt: 'Quanto tempo aguentamos?', en: 'How long do we last?' },
  { id: 'gaps', pt: 'O que está faltando?', en: "What's missing?" },
  { id: 'outside', pt: 'Dá para sair?', en: 'Is it safe outside?' },
]

/* ── helpers ─────────────────────────────────────────────────────────────── */

const toKmh = (mph: number) => Math.round(mph * 1.609)

function days(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value >= 10) return String(Math.round(value))
  return value >= 3 ? value.toFixed(0) : value.toFixed(1)
}

function criticalAlert(snapshot: WeatherSnapshot | null) {
  return (snapshot?.alerts ?? []).find(a => a.severity === 'CRITICAL')
}

function highAlert(snapshot: WeatherSnapshot | null) {
  return (snapshot?.alerts ?? []).find(a => a.severity === 'HIGH')
}

/** The reserve that runs out first — the only number that bounds the others. */
function bindingReserve(ctx: PilotContext, pt: boolean) {
  const candidates = [
    { key: 'water', label: pt ? 'água' : 'water', value: ctx.waterDays },
    { key: 'food', label: pt ? 'comida' : 'food', value: ctx.foodDays },
    { key: 'power', label: pt ? 'energia' : 'power', value: ctx.powerDays },
    { key: 'fuel', label: pt ? 'combustível' : 'fuel', value: ctx.fuelDays },
  ]
  return candidates.reduce((min, item) => (item.value < min.value ? item : min))
}

function weatherFactors(ctx: PilotContext, pt: boolean) {
  const current = ctx.snapshot?.current
  if (!current) return []
  return [
    {
      label: pt ? 'Rajada' : 'Gust',
      value: pt
        ? `${toKmh(current.wind_gust_mph ?? current.wind_mph)} km/h`
        : `${Math.round(current.wind_gust_mph ?? current.wind_mph)} mph`,
    },
    { label: pt ? 'Chuva' : 'Rain', value: `${Math.round(current.precip_prob_pct ?? 0)}%` },
  ]
}

/** Translated once, here — the engine never leaks rule codes to the surface. */
function describeRule(code: string, pt: boolean): string | null {
  if (code.startsWith('WATER_CRITICAL')) return pt ? 'Água crítica — reabasteça hoje' : 'Water critical — refill today'
  if (code.startsWith('WATER_LOW')) return pt ? 'Água abaixo do mínimo por pessoa' : 'Water below per-person minimum'
  if (code.startsWith('FOOD_CRITICAL')) return pt ? 'Comida para menos de 1 dia' : 'Less than 1 day of food'
  if (code.startsWith('FOOD_LOW')) return pt ? 'Comida abaixo de 3 dias' : 'Food below 3 days'
  if (code.includes('Nutrição do bebê')) return pt ? 'Nutrição do bebê é prioridade' : 'Infant nutrition is a priority'
  if (code.includes('Continuidade de medicação')) return pt ? 'Continuidade de medicação' : 'Medication continuity'
  if (code.includes('Evacuação acessível')) return pt ? 'Evacuação precisa ser acessível' : 'Evacuation must be accessible'
  if (code.startsWith('SEM_COMMS')) return pt ? 'Sem rádio de comunicação' : 'No communication radio'
  if (code.startsWith('FALLOUT')) return pt ? 'Abrigo no local obrigatório' : 'Shelter in place required'
  if (code.startsWith('EARTHQUAKE')) return pt ? 'Risco de réplicas' : 'Aftershock risk'
  return null
}

function householdGaps(ctx: PilotContext, pt: boolean) {
  if (!ctx.inventory) return { urgency: UrgencyLevel.LOW, items: [] as string[] }
  const result = RulesEngine.evaluate({
    people_count: Math.max(1, ctx.household.people),
    water_liters: ctx.inventory.water_liters,
    food_days: ctx.inventory.food_days,
    has_infants: ctx.household.hasInfants,
    has_medical_conditions: ctx.household.hasMedicalConditions,
    mobility_impaired: ctx.household.mobilityImpaired,
    has_communication_device: ctx.inventory.has_communication_device,
  })
  return {
    urgency: result.urgency,
    items: result.rulesApplied.map(code => describeRule(code, pt)).filter(Boolean) as string[],
  }
}

/** The roster gates how much the Pilot is allowed to claim. */
function rosterCaveat(ctx: PilotContext, pt: boolean) {
  if (ctx.household.known) return undefined
  return pt
    ? 'Ainda não li a ficha da família — bebês, medicação e mobilidade não entraram nesta conta.'
    : 'I have not read the family record yet — infants, medication and mobility are not in this answer.'
}

/* ── intents ─────────────────────────────────────────────────────────────── */

function answerNow(ctx: PilotContext): PilotAnswer {
  const { pt } = ctx
  const critical = criticalAlert(ctx.snapshot)
  const high = highAlert(ctx.snapshot)
  const gaps = householdGaps(ctx, pt)
  const binding = bindingReserve(ctx, pt)

  if (ctx.riskState === 'critical' || critical) {
    return {
      intent: 'now',
      verdict: 'act',
      headline: pt ? 'Aja agora — ameaça ativa' : 'Act now — active threat',
      body: critical
        ? critical.headline
        : pt
          ? 'O índice de risco está em nível crítico na sua área.'
          : 'The risk index is at a critical level in your area.',
      factors: [
        { label: pt ? 'Autonomia' : 'Autonomy', value: `${days(ctx.autonomyDays)} ${pt ? 'dias' : 'days'}` },
        { label: 'Checklist', value: `${ctx.checklistPct}%` },
        ...weatherFactors(ctx, pt),
      ].slice(0, 4),
      actions: [
        { label: pt ? 'Abrir resposta' : 'Open response', href: '/scenario', primary: true },
        { label: pt ? 'Avisar o círculo' : 'Alert my circle', href: '/circles' },
      ],
      caveat: rosterCaveat(ctx, pt),
    }
  }

  if (ctx.riskState === 'warning' || high || gaps.urgency === UrgencyLevel.CRITICAL) {
    return {
      intent: 'now',
      verdict: 'hold',
      headline: pt ? 'Prepare agora — ainda há janela' : 'Prepare now — the window is still open',
      body: high
        ? high.headline
        : gaps.items[0] ??
          (pt
            ? 'As condições estão piorando e a casa ainda não está pronta.'
            : 'Conditions are deteriorating and the household is not ready yet.'),
      factors: [
        { label: pt ? 'Limitante' : 'Bottleneck', value: `${binding.label} · ${days(binding.value)}d` },
        { label: 'Checklist', value: `${ctx.checklistPct}%` },
        ...weatherFactors(ctx, pt),
      ].slice(0, 4),
      actions: [
        { label: 'Checklist', href: '/checklist', primary: true },
        { label: pt ? 'Ver inventário' : 'View inventory', href: '/inventory' },
      ],
      caveat: rosterCaveat(ctx, pt),
    }
  }

  if (ctx.riskState === 'watch' || gaps.urgency === UrgencyLevel.HIGH) {
    return {
      intent: 'now',
      verdict: 'watch',
      headline: pt ? 'Nada urgente — feche uma lacuna' : 'Nothing urgent — close one gap',
      body:
        gaps.items[0] ??
        (pt
          ? 'Vale usar a calmaria para melhorar a posição da família.'
          : 'Worth using the calm to improve the household position.'),
      factors: [
        { label: pt ? 'Limitante' : 'Bottleneck', value: `${binding.label} · ${days(binding.value)}d` },
        { label: 'Checklist', value: `${ctx.checklistPct}%` },
      ],
      actions: [
        { label: 'Checklist', href: '/checklist', primary: true },
        { label: pt ? 'Inventário' : 'Inventory', href: '/inventory' },
      ],
      caveat: rosterCaveat(ctx, pt),
    }
  }

  return {
    intent: 'now',
    verdict: 'ready',
    headline: pt ? 'Nada exige ação agora' : 'Nothing needs action now',
    body: gaps.items.length
      ? gaps.items[0]
      : pt
        ? `A família aguenta ${days(ctx.autonomyDays)} dias com o que tem em casa.`
        : `The household lasts ${days(ctx.autonomyDays)} days on what is at home.`,
    factors: [
      { label: pt ? 'Autonomia' : 'Autonomy', value: `${days(ctx.autonomyDays)} ${pt ? 'dias' : 'days'}` },
      { label: 'Checklist', value: `${ctx.checklistPct}%` },
    ],
    actions: [{ label: pt ? 'Ver plano' : 'View plan', href: '/scenario' }],
    caveat: rosterCaveat(ctx, pt),
  }
}

function answerStayOrGo(ctx: PilotContext): PilotAnswer {
  const { pt } = ctx
  const critical = criticalAlert(ctx.snapshot)
  const alerts = ctx.snapshot?.alerts ?? []
  // An evacuation is an official instruction, never something EOS infers from
  // weather data. The Pilot's job is to surface the order, not to replace it.
  const evacuationOrder = alerts.find(a => /EVACUAT|EVACUA|TORNADO|TSUNAMI/i.test(`${a.type} ${a.headline}`))

  if (evacuationOrder) {
    return {
      intent: 'stay_or_go',
      verdict: 'act',
      headline: pt ? 'Siga a ordem oficial — saia' : 'Follow the official order — leave',
      body: evacuationOrder.headline,
      factors: [
        { label: pt ? 'Combustível' : 'Fuel', value: `${days(ctx.fuelDays)}d` },
        {
          label: pt ? 'Mobilidade' : 'Mobility',
          value: ctx.household.mobilityImpaired
            ? `${ctx.household.mobilityImpaired} ${pt ? 'pessoa(s)' : 'person(s)'}`
            : pt
              ? 'sem restrição'
              : 'unrestricted',
        },
      ],
      actions: [
        { label: pt ? 'Abrir rota' : 'Open route', href: '/scenario', primary: true },
        { label: pt ? 'Avisar o círculo' : 'Alert my circle', href: '/circles' },
      ],
      caveat: rosterCaveat(ctx, pt),
    }
  }

  if (critical || ctx.riskState === 'critical') {
    return {
      intent: 'stay_or_go',
      verdict: 'act',
      headline: pt ? 'Fique abrigado — não se desloque' : 'Shelter in place — do not travel',
      body: pt
        ? 'Não há ordem de evacuação, e sair durante o pico expõe a família sem necessidade.'
        : 'There is no evacuation order, and moving during the peak exposes the family for no gain.',
      factors: [
        { label: pt ? 'Autonomia' : 'Autonomy', value: `${days(ctx.autonomyDays)}d` },
        ctx.nearestShelter
          ? { label: pt ? 'Abrigo aberto' : 'Open shelter', value: `${ctx.nearestShelter.distanceKm.toFixed(1)} km` }
          : { label: pt ? 'Abrigos' : 'Shelters', value: ctx.sheltersKnown ? (pt ? 'nenhum aberto' : 'none open') : '—' },
        ...weatherFactors(ctx, pt),
      ].slice(0, 3),
      actions: [{ label: pt ? 'Abrir resposta' : 'Open response', href: '/scenario', primary: true }],
      caveat: rosterCaveat(ctx, pt),
    }
  }

  // An open official shelter changes the answer: it is the only destination EOS
  // is allowed to name. Note the asymmetry — a shelter existing does not mean
  // "go", it means "there is somewhere to go if you must".
  const shelter = ctx.nearestShelter
  const canSustain = ctx.autonomyDays >= 3
  const shelterFactor = shelter
    ? { label: pt ? 'Abrigo aberto' : 'Open shelter', value: `${shelter.distanceKm.toFixed(1)} km` }
    : ctx.sheltersKnown
      ? { label: pt ? 'Abrigos' : 'Shelters', value: pt ? 'nenhum aberto' : 'none open' }
      : { label: pt ? 'Abrigos' : 'Shelters', value: '—' }

  return {
    intent: 'stay_or_go',
    verdict: canSustain ? 'ready' : 'watch',
    headline: canSustain
      ? pt
        ? 'Ficar é a opção mais segura'
        : 'Staying is the safer option'
      : pt
        ? 'Ficar dá — mas as reservas são curtas'
        : 'Staying works — but reserves are short',
    body: canSustain
      ? pt
        ? `Sem ordem oficial e com ${days(ctx.autonomyDays)} dias de autonomia, deslocar-se adiciona risco sem reduzir nenhum.`
        : `With no official order and ${days(ctx.autonomyDays)} days of autonomy, moving adds risk without removing any.`
      : pt
        ? `A casa aguenta ${days(ctx.autonomyDays)} dias. Reabasteça antes que a janela feche.`
        : `The household lasts ${days(ctx.autonomyDays)} days. Restock before the window closes.`,
    factors: [
      { label: pt ? 'Autonomia' : 'Autonomy', value: `${days(ctx.autonomyDays)}d` },
      shelterFactor,
      { label: pt ? 'Combustível' : 'Fuel', value: `${days(ctx.fuelDays)}d` },
    ],
    actions: [
      { label: pt ? 'Inventário' : 'Inventory', href: '/inventory', primary: !canSustain },
      { label: pt ? 'Ver plano' : 'View plan', href: '/scenario' },
    ],
    caveat: rosterCaveat(ctx, pt),
  }
}

function answerEndurance(ctx: PilotContext): PilotAnswer {
  const { pt } = ctx
  const binding = bindingReserve(ctx, pt)
  const short = ctx.autonomyDays < 3

  return {
    intent: 'endurance',
    verdict: ctx.autonomyDays < 1 ? 'act' : short ? 'hold' : 'ready',
    headline: `${days(ctx.autonomyDays)} ${pt ? 'dias' : 'days'}`,
    body: ctx.inventory
      ? pt
        ? `Limitado por ${binding.label}. Os outros recursos duram mais, então é ele que define o número.`
        : `Bounded by ${binding.label}. The other reserves last longer, so that is what sets the number.`
      : pt
        ? 'Ainda não li seu inventário — preencha para eu calcular isso de verdade.'
        : 'I have not read your inventory yet — fill it in so I can compute this properly.',
    factors: [
      { label: pt ? 'Água' : 'Water', value: `${days(ctx.waterDays)}d` },
      { label: pt ? 'Comida' : 'Food', value: `${days(ctx.foodDays)}d` },
      { label: pt ? 'Energia' : 'Power', value: `${days(ctx.powerDays)}d` },
      { label: pt ? 'Combustível' : 'Fuel', value: `${days(ctx.fuelDays)}d` },
    ],
    actions: [{ label: pt ? 'Ajustar inventário' : 'Adjust inventory', href: '/inventory', primary: short }],
    caveat: rosterCaveat(ctx, pt),
  }
}

function answerGaps(ctx: PilotContext): PilotAnswer {
  const { pt } = ctx
  const gaps = householdGaps(ctx, pt)

  if (!ctx.inventory) {
    return {
      intent: 'gaps',
      verdict: 'watch',
      headline: pt ? 'Não sei ainda' : 'I do not know yet',
      body: pt
        ? 'Sem inventário eu não consigo dizer o que falta sem inventar. Preencha e eu respondo na hora.'
        : 'Without an inventory I cannot say what is missing without making it up. Fill it in and I answer instantly.',
      factors: [],
      actions: [{ label: pt ? 'Preencher inventário' : 'Fill inventory', href: '/inventory', primary: true }],
    }
  }

  if (!gaps.items.length) {
    return {
      intent: 'gaps',
      verdict: 'ready',
      headline: pt ? 'Nenhuma lacuna crítica' : 'No critical gap',
      body: pt
        ? `Nenhuma regra do EOS disparou. O checklist está em ${ctx.checklistPct}%.`
        : `No EOS rule fired. The checklist is at ${ctx.checklistPct}%.`,
      factors: [{ label: 'Checklist', value: `${ctx.checklistPct}%` }],
      actions: [{ label: 'Checklist', href: '/checklist' }],
      caveat: rosterCaveat(ctx, pt),
    }
  }

  return {
    intent: 'gaps',
    verdict: gaps.urgency === UrgencyLevel.CRITICAL ? 'act' : gaps.urgency === UrgencyLevel.HIGH ? 'hold' : 'watch',
    headline: pt
      ? `${gaps.items.length} ${gaps.items.length === 1 ? 'lacuna' : 'lacunas'} a fechar`
      : `${gaps.items.length} gap${gaps.items.length === 1 ? '' : 's'} to close`,
    body: gaps.items[0],
    factors: gaps.items.slice(1, 4).map(item => ({ label: pt ? 'Também' : 'Also', value: item })),
    actions: [
      { label: pt ? 'Inventário' : 'Inventory', href: '/inventory', primary: true },
      { label: 'Checklist', href: '/checklist' },
    ],
    caveat: rosterCaveat(ctx, pt),
  }
}

function answerOutside(ctx: PilotContext): PilotAnswer {
  const { pt } = ctx
  const current = ctx.snapshot?.current
  const critical = criticalAlert(ctx.snapshot)

  if (!current) {
    return {
      intent: 'outside',
      verdict: 'watch',
      headline: pt ? 'Sem leitura do tempo' : 'No weather reading',
      body: ctx.hasCoords
        ? pt
          ? 'Não consegui ler as condições agora. Sem isso eu não dou um veredito.'
          : 'I could not read conditions right now. Without that I will not give a verdict.'
        : pt
          ? 'Preciso da sua localização para responder isso.'
          : 'I need your location to answer this.',
      factors: [],
      actions: [{ label: pt ? 'Ver clima' : 'View weather', href: '/weather' }],
    }
  }

  if (critical || ctx.riskState === 'critical') {
    return {
      intent: 'outside',
      verdict: 'act',
      headline: pt ? 'Não. Fique dentro.' : 'No. Stay inside.',
      body: critical?.headline ?? (pt ? 'Ameaça ativa na sua área.' : 'Active threat in your area.'),
      factors: weatherFactors(ctx, pt),
      actions: [{ label: pt ? 'Abrir resposta' : 'Open response', href: '/scenario', primary: true }],
    }
  }

  const gust = current.wind_gust_mph ?? current.wind_mph
  const precip = Math.max(
    current.precip_prob_pct ?? 0,
    ...(ctx.snapshot?.hourly.slice(0, 6).map(h => h.precip_prob_pct) ?? [0]),
  )
  const uv = current.uv_index ?? 0
  const aqi = ctx.snapshot?.air_quality?.us_aqi ?? 0
  const visibility = current.visibility_mi ?? 10
  const storm = (current.weather_code ?? 0) >= 95

  const verdict: PilotVerdict =
    storm || gust > 40 || precip > 82 || visibility < 1 || ctx.riskState === 'warning'
      ? 'act'
      : gust > 30 || precip > 60 || aqi > 150 || ctx.riskState === 'watch'
        ? 'hold'
        : gust > 20 || precip > 35 || uv >= 8 || aqi > 100
          ? 'watch'
          : 'ready'

  const headline = {
    act: pt ? 'Não é hora de sair' : 'Not a good time to go out',
    hold: pt ? 'Espere a janela abrir' : 'Wait for the window',
    watch: pt ? 'Dá, com limites' : 'Yes, with limits',
    ready: pt ? 'Pode ir' : 'Go ahead',
  }[verdict]

  const window = nextGoodWindow(ctx, verdict)

  return {
    intent: 'outside',
    verdict,
    headline,
    body: window,
    factors: [
      ...weatherFactors(ctx, pt),
      { label: 'UV', value: `${uv}` },
      ...(aqi ? [{ label: 'AQI', value: `${aqi}` }] : []),
    ].slice(0, 4),
    actions: [{ label: pt ? 'Ver clima' : 'View weather', href: '/weather' }],
  }
}

function nextGoodWindow(ctx: PilotContext, verdict: PilotVerdict) {
  const { pt } = ctx
  if (verdict === 'act') return pt ? 'Sem janela segura nas próximas horas.' : 'No safe window in the next few hours.'
  const hours = ctx.snapshot?.hourly.slice(0, 8) ?? []
  const good = hours.find(
    h => h.precip_prob_pct < 35 && h.wind_gust_mph < 22 && h.visibility_mi >= 3 && h.weather_code < 95,
  )
  if (!good) return pt ? 'A janela é curta e instável.' : 'The window is short and unstable.'
  const time = new Date(good.time_iso).toLocaleTimeString(pt ? 'pt-BR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return pt ? `Melhor janela a partir de ${time}.` : `Best window from ${time}.`
}

/* ── entry point ─────────────────────────────────────────────────────────── */

export function askPilot(intent: PilotIntentId, ctx: PilotContext): PilotAnswer {
  switch (intent) {
    case 'stay_or_go':
      return answerStayOrGo(ctx)
    case 'endurance':
      return answerEndurance(ctx)
    case 'gaps':
      return answerGaps(ctx)
    case 'outside':
      return answerOutside(ctx)
    case 'now':
    default:
      return answerNow(ctx)
  }
}
