import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generationParams, getOpenAIClient, getOpenAIModel } from '@/lib/openai'
import { enforceAiBudget, rateLimitHeaders } from '@/lib/rate-limit'
import { logError } from '@/lib/error-log'
import { getHousehold } from '@/lib/household'
import { getRelevantChunks } from '@/lib/knowledge'
import { buildPilotCircleRecord, buildPilotFamilyRecord, type CircleVisibleMemberRecord } from '@/lib/pilot-family-record'

/**
 * POST /api/pilot/chat — the Pilot's conversational layer.
 *
 * ADDITIVE BY DESIGN (D-062.1). The deterministic local engine still produces
 * the instant briefing and still works with no network; this route is the
 * specialist you can *talk to* when there is a connection. It never replaces the
 * local answer and it can never soften a critical rule.
 *
 * It returns two things: prose, and TASKS. If the specialist tells you to buy
 * fuel, that has to become something you can execute — advice that evaporates
 * when you close the screen is the reason preparedness apps fail.
 *
 * Tasks are PROPOSED, never written. The client adds them on an explicit tap,
 * consistent with UPP-03 and D-067: nothing changes the family's plan silently.
 */

type Msg = { role: 'user' | 'assistant'; content: string }

export type PilotTask = {
  name: string
  why: string
  tier: 'ESSENTIAL' | 'MODERATE' | 'EXCELLENT'
  quantity?: number
  unit?: string | null
  kind: 'resource' | 'task' | 'plan_review' | 'comms_setup'
  source: string
  destination: string
}

export type PilotMemoryProposal = {
  title: string
  reason: string
  proposal_md: string
}

type Body = {
  messages: Msg[]
  context: {
    pt: boolean
    riskState: 'safe' | 'watch' | 'warning' | 'critical'
    score: number | null
    headline: string
    autonomyDays: number
    waterDays: number
    foodDays: number
    powerDays: number
    fuelDays: number
    checklistPct: number
    people: number
    hasInfants: boolean
    hasMedicalConditions: boolean
    mobilityImpaired: number
    simulated: boolean
    /** Sources the drill switched off. The Pilot must name the blindness. */
    downSources: string[]
    /** Live conditions. Without these the model correctly says it cannot know. */
    weather: {
      tempF: number
      feelsF: number
      humidityPct: number
      windMph: number
      gustMph: number
      uvIndex: number
      visibilityMi: number
      pressureHpa: number
      precipProbPct: number
      condition: string
    } | null
    airQualityAqi: number | null
    alerts: Array<{ severity: string; type: string; headline: string }>
    cyclones?: Array<{
      name: string
      classification: string
      windKmh: number
      distanceKm: number | null
      headingDeg: number | null
      speedKmh: number | null
      relevant: boolean
    }>
    wind?: { speedKmh: number; gustKmh: number | null; fromDeg: number } | null
    earthquakes: Array<{ magnitude: number; place: string }>
    /** Next hours, so "when does it get bad" is answerable. */
    hourly: Array<{ hour: string; tempF: number; precipProbPct: number; gustMph: number }>
    nearestShelter: { name: string; distanceKm: number } | null
    sheltersKnown: boolean
    inventory: {
      waterLiters: number
      foodDays: number
      fuelLiters: number
      batteryPercent: number
      hasMedicalKit: boolean
      hasCommsDevice: boolean
    } | null
    locationLabel: string | null
    fetchedAt: string | null
    /** Where the user is. */
    selfCoords: { lat: number; lng: number } | null
    /**
     * Consented family positions (D-068). Distances and bearings are computed
     * ON DEVICE and sent as numbers — the model reports geometry, it never
     * calculates it. Trigonometry is exactly what language models get subtly
     * and confidently wrong.
     */
    family: Array<{ name: string; lat: number; lng: number; freshness: string; distanceKm: number; heading: string; isMe: boolean }>
    shelterList: Array<{ name: string; lat: number; lng: number; distanceKm: number; heading: string }>
    /** What the user just looked up on the map — treat it as their destination of interest. */
    searchedPlace: { label: string; lat: number; lng: number; distanceKm: number; heading: string } | null
  }
}

/** A place the Pilot considers worth travelling to. */
export type PilotDestination = { label: string; lat: number; lng: number }

/**
 * Look up real places near the user for the question being asked.
 *
 * Without this the Pilot can only ever name shelters and family — so "a Home
 * Depot near me" got the honest but useless answer that no such place was in the
 * data. The specialist has to be able to look things up.
 *
 * Runs BEFORE the model and hands it real coordinates, so the model never
 * invents an address. Nominatim's policy allows this: one request per user
 * message is not typeahead.
 */
const FILLER = /\b(onde|tem|uma?|um|perto|de|mim|aqui|qual|é|o|a|mais|proxim[oa]|próxim[oa]|me|leve|até|como|chego|na|no|em|encontrar|achar|buscar|procur\w*|where|is|the|a|an|near|me|closest|nearest|find|to|get|how|do|i)\b/gi

async function findPlaces(question: string, at: { lat: number; lng: number } | null) {
  const query = question.replace(FILLER, ' ').replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim()
  if (query.length < 3 || !at) return [] as Array<{ label: string; lat: number; lng: number; distanceKm: number }>

  // 0.6° is ~66 km of latitude — wide enough that a search near Parkland
  // reached Miami and the model picked it. A tight box plus a distance sort is
  // what "nearest" actually means.
  const d = 0.25
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '12',
    viewbox: `${at.lng - d},${at.lat + d},${at.lng + d},${at.lat - d}`,
    bounded: '1',
  })

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'EOS Emergency Operating System / 1.0 (brightscalegroup@gmail.com)' },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 3600 },
    })
    if (!response.ok) return []
    const raw = (await response.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>
    return raw
      .map(item => {
        const lat = Number(item.lat)
        const lng = Number(item.lon)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
        return {
          label: (item.display_name ?? '').split(',').slice(0, 2).join(',').trim(),
          lat,
          lng,
          distanceKm: haversineKm(at, { lat, lng }),
        }
      })
      .filter((p): p is { label: string; lat: number; lng: number; distanceKm: number } => p !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 4)
  } catch {
    return []
  }
}

/** Same maths as the client, kept server-side so the model never computes it. */
function haversineKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(to.lat - from.lat)
  const dLng = rad(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

type CircleMembership = {
  circle_id: string
  user_id: string
  role: string | null
  share_inventory: boolean | null
  shared_fields: string[] | null
  family_access_status?: string | null
}

type CircleProfile = {
  id: string
  name?: string | null
  location?: string | null
  blood_type?: string | null
  allergies?: string[] | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  medical_notes?: string | null
  medications?: string[] | null
}

const sharedFieldsOf = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
const hasFamilyAccess = (member: CircleMembership, userId: string) => member.user_id === userId || member.family_access_status === 'approved'

async function loadPilotCircleRecord(userId: string, pt: boolean) {
  const admin = createAdminClient()
  if (!admin) {
    return pt
      ? 'MEMBROS VISÍVEIS DO CÍRCULO: service-role indisponível; não consegui carregar fichas do círculo nesta resposta.'
      : 'VISIBLE CIRCLE MEMBERS: service role unavailable; could not load circle records for this answer.'
  }

  const { data: mine, error: mineError } = await admin
    .from('circle_members')
    .select('circle_id, user_id, role, share_inventory, shared_fields')
    .eq('user_id', userId)
  if (mineError || !mine?.length) return ''

  const circleIds = Array.from(new Set((mine as CircleMembership[]).map(m => m.circle_id)))
  const [{ data: circles }, { data: members }] = await Promise.all([
    admin.from('circles').select('id, name').in('id', circleIds),
    admin.from('circle_members').select('circle_id, user_id, role, share_inventory, shared_fields, family_access_status').in('circle_id', circleIds),
  ])

  let memberships = (members ?? []) as CircleMembership[]
  if (!members) {
    const { data: legacyMembers } = await admin
      .from('circle_members')
      .select('circle_id, user_id, role, share_inventory, shared_fields')
      .in('circle_id', circleIds)
    memberships = (legacyMembers ?? []) as CircleMembership[]
  }
  if (!memberships.length) return ''

  const profileIds = Array.from(new Set(memberships.map(m => m.user_id)))
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, name, location, blood_type, allergies, emergency_contact_name, emergency_contact_phone, medical_notes, medications')
    .in('id', profileIds)

  const circleNameById = new Map((circles ?? []).map(c => [c.id as string, (c.name as string | null) ?? '']))
  const profileById = new Map<string, CircleProfile>()
  for (const profile of profiles ?? []) profileById.set(profile.id as string, profile as CircleProfile)

  const visible: CircleVisibleMemberRecord[] = memberships
    .sort((a, b) => {
      const byCircle = (circleNameById.get(a.circle_id) ?? '').localeCompare(circleNameById.get(b.circle_id) ?? '')
      if (byCircle !== 0) return byCircle
      return (profileById.get(a.user_id)?.name ?? '').localeCompare(profileById.get(b.user_id)?.name ?? '')
    })
    .map(member => {
      const profile = profileById.get(member.user_id) ?? null
      const fields = sharedFieldsOf(member.shared_fields)
      const isMe = member.user_id === userId
      const familyApproved = hasFamilyAccess(member, userId)
      const medicalShared = familyApproved
      const contactShared = familyApproved
      const locationShared = isMe || fields.includes('location')

      return {
        circleName: circleNameById.get(member.circle_id) ?? '',
        name: profile?.name ?? null,
        role: member.role ?? null,
        isMe,
        familyAccessApproved: familyApproved && !isMe,
        medicalShared,
        contactShared,
        locationShared,
        location: locationShared ? (profile?.location ?? null) : null,
        blood_type: medicalShared ? (profile?.blood_type ?? null) : null,
        allergies: medicalShared ? (profile?.allergies ?? null) : null,
        medications: medicalShared ? (profile?.medications ?? null) : null,
        medical_notes: medicalShared ? (profile?.medical_notes ?? null) : null,
        emergency_contact_name: contactShared ? (profile?.emergency_contact_name ?? null) : null,
        emergency_contact_phone: contactShared ? (profile?.emergency_contact_phone ?? null) : null,
      }
    })

  return buildPilotCircleRecord({ members: visible, pt }).slice(0, 5000)
}

const toC = (f: number) => Math.round(((f - 32) * 5) / 9)
const toKmh = (mph: number) => Math.round(mph * 1.609)
const toKm = (mi: number) => (mi * 1.609).toFixed(1)

/**
 * The live situation, rendered for the model. This block is the difference
 * between a specialist and a chatbot: without it the model truthfully answers
 * that it has no real-time access, which is exactly the wrong answer when the
 * app is holding a current weather snapshot.
 */
/** Ponto cardeal a partir de graus verdadeiros. */
function compass(deg: number, pt: boolean): string {
  const pts = pt
    ? ['N', 'NNE', 'NE', 'ENE', 'L', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
    : ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return pts[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
}

function situationReport(ctx: Body['context']): string {
  const pt = ctx.pt
  const lines: string[] = []

  if (ctx.weather) {
    const w = ctx.weather
    lines.push(
      pt
        ? `- Agora: ${toC(w.tempF)}°C (sensação ${toC(w.feelsF)}°C), ${w.condition}. Vento ${toKmh(w.windMph)} km/h, rajada ${toKmh(w.gustMph)} km/h. Umidade ${w.humidityPct}%. UV ${w.uvIndex}. Visibilidade ${toKm(w.visibilityMi)} km. Pressão ${w.pressureHpa} hPa. Chance de chuva ${w.precipProbPct}%.`
        : `- Now: ${Math.round(w.tempF)}°F (feels ${Math.round(w.feelsF)}°F), ${w.condition}. Wind ${Math.round(w.windMph)} mph, gust ${Math.round(w.gustMph)} mph. Humidity ${w.humidityPct}%. UV ${w.uvIndex}. Visibility ${w.visibilityMi.toFixed(1)} mi. Pressure ${w.pressureHpa} hPa. Rain chance ${w.precipProbPct}%.`,
    )
  }
  if (ctx.airQualityAqi !== null && ctx.airQualityAqi !== undefined) {
    lines.push(pt ? `- Qualidade do ar (AQI): ${ctx.airQualityAqi}` : `- Air quality (AQI): ${ctx.airQualityAqi}`)
  }
  if (ctx.hourly?.length) {
    const series = ctx.hourly
      .map(h => (pt ? `${h.hour} ${toC(h.tempF)}°C chuva ${h.precipProbPct}% rajada ${toKmh(h.gustMph)}km/h` : `${h.hour} ${Math.round(h.tempF)}°F rain ${h.precipProbPct}% gust ${Math.round(h.gustMph)}mph`))
      .join(' | ')
    lines.push(pt ? `- Próximas horas: ${series}` : `- Next hours: ${series}`)
  }
  if (ctx.alerts?.length) {
    lines.push(
      (pt ? '- Alertas oficiais ativos: ' : '- Active official alerts: ') +
        ctx.alerts.map(a => `[${a.severity}] ${a.headline}`).join(' ; '),
    )
  } else {
    lines.push(pt ? '- Alertas oficiais ativos: nenhum' : '- Active official alerts: none')
  }
  /**
   * Ciclones — e a distância QUALIFICADA.
   *
   * Sem dizer se a tempestade é assunto da pessoa, o modelo trata "furacão a
   * 5.000 km no Pacífico" com o mesmo peso de um a 200 km, e passa a alarmar
   * quem não precisa. A qualificação vem calculada do cliente, não é julgamento
   * do modelo.
   */
  if (ctx.cyclones?.length) {
    lines.push(
      (pt ? '- Ciclones tropicais ativos: ' : '- Active tropical cyclones: ') +
        ctx.cyclones
          .map(cy => {
            // Rumo em ponto cardeal: "indo para ONO" é executável, "direção
            // 285°" obriga quem lê a fazer a conversão de cabeça.
            const rumo = cy.headingDeg !== null
              ? `${compass(cy.headingDeg, pt)} (${cy.headingDeg}°)`
              : (pt ? 'rumo desconhecido' : 'unknown heading')
            const dist = cy.distanceKm !== null ? `${cy.distanceKm} km` : (pt ? 'distância desconhecida' : 'unknown distance')
            const peso = cy.relevant
              ? (pt ? 'PODE AFETAR a área' : 'COULD AFFECT the area')
              : (pt ? 'longe demais para afetar agora' : 'too far to affect now')
            return `${cy.name} (${cy.classification}) ${cy.windKmh} km/h, ${dist}, ${pt ? 'indo a' : 'moving'} ${rumo} — ${peso}`
          })
          .join(' ; '),
    )
  } else {
    lines.push(pt ? '- Ciclones tropicais ativos: nenhum' : '- Active tropical cyclones: none')
  }

  if (ctx.wind) {
    lines.push(
      pt
        ? `- Vento medido no ponto: ${ctx.wind.speedKmh} km/h${ctx.wind.gustKmh ? `, rajada ${ctx.wind.gustKmh} km/h` : ''}, vindo de ${ctx.wind.fromDeg}°`
        : `- Measured wind at the point: ${ctx.wind.speedKmh} km/h${ctx.wind.gustKmh ? `, gusting ${ctx.wind.gustKmh} km/h` : ''}, from ${ctx.wind.fromDeg}°`,
    )
  }

  if (ctx.earthquakes?.length) {
    lines.push(
      (pt ? '- Sismos recentes: ' : '- Recent earthquakes: ') +
        ctx.earthquakes.map(e => `M${e.magnitude} ${e.place}`).join(' ; '),
    )
  }
  if (ctx.inventory) {
    const i = ctx.inventory
    lines.push(
      pt
        ? `- Inventário: ${i.waterLiters} L de água, ${i.foodDays} dias de comida, ${i.fuelLiters} L de combustível, bateria ${i.batteryPercent}%, kit médico ${i.hasMedicalKit ? 'sim' : 'não'}, rádio ${i.hasCommsDevice ? 'sim' : 'não'}.`
        : `- Inventory: ${i.waterLiters} L water, ${i.foodDays} days food, ${i.fuelLiters} L fuel, battery ${i.batteryPercent}%, medical kit ${i.hasMedicalKit ? 'yes' : 'no'}, radio ${i.hasCommsDevice ? 'yes' : 'no'}.`,
    )
  }
  if (ctx.nearestShelter) {
    lines.push(
      pt
        ? `- Abrigo oficial aberto mais próximo: ${ctx.nearestShelter.name}, a ${ctx.nearestShelter.distanceKm.toFixed(1)} km.`
        : `- Nearest open official shelter: ${ctx.nearestShelter.name}, ${ctx.nearestShelter.distanceKm.toFixed(1)} km away.`,
    )
  } else if (ctx.sheltersKnown) {
    lines.push(pt ? '- Abrigos oficiais abertos por perto: nenhum (normal fora de desastre ativo).' : '- Open official shelters nearby: none (normal outside an active disaster).')
  }
  if (ctx.selfCoords) {
    lines.push(
      pt
        ? `- Sua posição: ${ctx.selfCoords.lat.toFixed(5)}, ${ctx.selfCoords.lng.toFixed(5)}`
        : `- Your position: ${ctx.selfCoords.lat.toFixed(5)}, ${ctx.selfCoords.lng.toFixed(5)}`,
    )
  }
  if (ctx.family?.length) {
    lines.push(
      (pt ? '- Família (posições consentidas): ' : '- Family (consented positions): ') +
        ctx.family
          .map(m =>
            pt
              ? `${m.name}${m.isMe ? ' (você)' : ''} em ${m.lat.toFixed(5)},${m.lng.toFixed(5)} — ${m.distanceKm.toFixed(1)} km a ${m.heading}, leitura ${m.freshness}`
              : `${m.name}${m.isMe ? ' (you)' : ''} at ${m.lat.toFixed(5)},${m.lng.toFixed(5)} — ${m.distanceKm.toFixed(1)} km ${m.heading}, reading ${m.freshness}`,
          )
          .join(' ; '),
    )
  } else {
    lines.push(pt ? '- Família: nenhum membro compartilhando posição.' : '- Family: no member is sharing position.')
  }
  if (ctx.shelterList?.length) {
    lines.push(
      (pt ? '- Abrigos oficiais abertos: ' : '- Open official shelters: ') +
        ctx.shelterList
          .map(sh => `${sh.name} (${sh.lat.toFixed(5)},${sh.lng.toFixed(5)}) ${sh.distanceKm.toFixed(1)} km ${sh.heading}`)
          .join(' ; '),
    )
  }
  if (ctx.searchedPlace) {
    const sp = ctx.searchedPlace
    lines.push(
      pt
        ? `- Lugar que o usuário acabou de buscar no mapa: ${sp.label} (${sp.lat.toFixed(5)},${sp.lng.toFixed(5)}), a ${sp.distanceKm.toFixed(1)} km ${sp.heading}.`
        : `- Place the user just searched on the map: ${sp.label} (${sp.lat.toFixed(5)},${sp.lng.toFixed(5)}), ${sp.distanceKm.toFixed(1)} km ${sp.heading}.`,
    )
  }
  if (ctx.locationLabel) lines.push(pt ? `- Local: ${ctx.locationLabel}` : `- Location: ${ctx.locationLabel}`)
  if (ctx.fetchedAt) lines.push(pt ? `- Leitura de: ${ctx.fetchedAt}` : `- Reading taken at: ${ctx.fetchedAt}`)

  return lines.join('\n')
}

/**
 * Tone is a function of the risk index — the single most requested behaviour of
 * this screen. A calm day deserves a teacher; a critical hour deserves an
 * instructor who leads with the verb.
 */
const TONE: Record<Body['context']['riskState'], { pt: string; en: string }> = {
  safe: {
    pt: 'Tom CALMO e didático. Há tempo de sobra. Explique o porquê das coisas, ensine, e proponha UMA melhoria por vez. Pode usar 3 a 5 frases.',
    en: 'CALM, teaching tone. There is plenty of time. Explain the why, teach, propose ONE improvement at a time. 3 to 5 sentences is fine.',
  },
  watch: {
    pt: 'Tom ATENTO. Priorize. Frases curtas. Diga o que fazer nesta semana, não algum dia.',
    en: 'ALERT tone. Prioritise. Short sentences. Say what to do this week, not someday.',
  },
  warning: {
    pt: 'Tom FOCADO e diretivo. Sem preâmbulo. Passos numerados, no máximo 4. Comece pela ação mais urgente.',
    en: 'FOCUSED, directive tone. No preamble. Numbered steps, at most 4. Lead with the most urgent action.',
  },
  critical: {
    pt: 'Tom IMPERATIVO. A primeira frase é uma ordem de ação, com verbo no imperativo. No máximo 3 passos. Zero teoria, zero explicação. Vidas primeiro, bens depois.',
    en: 'IMPERATIVE tone. The first sentence is an action order in the imperative. At most 3 steps. Zero theory. Lives first, property second.',
  },
}

/**
 * Salvage a readable answer from a truncated or malformed payload.
 *
 * This exists because the raw JSON once reached the user's screen: the model hit
 * the token ceiling mid-object, JSON.parse threw, and the fallback printed the
 * source. Whatever happens, the person on the other side must never see braces.
 */
function salvageReply(raw: string): string {
  const field = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/)
  if (field?.[1]) {
    try {
      return JSON.parse(`"${field[1]}"`) as string
    } catch {
      return field[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim()
    }
  }
  // No recognisable reply field: strip anything JSON-shaped rather than show it.
  const cleaned = raw.replace(/[{}[\]]/g, ' ').replace(/"\w+"\s*:/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.length > 20 ? cleaned : ''
}

function normalizeTaskKind(kind: unknown): PilotTask['kind'] {
  return kind === 'resource' || kind === 'plan_review' || kind === 'comms_setup' ? kind : 'task'
}

function extractJson(raw: string, pt: boolean): { reply: string; tasks: PilotTask[]; destinations: PilotDestination[]; memory: PilotMemoryProposal[] } {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return { reply: salvageReply(raw), tasks: [], destinations: [], memory: [] }
  try {
    const parsed = JSON.parse(match[0]) as { reply?: string; tasks?: unknown; destinations?: unknown; memory?: unknown }
    const tasks = Array.isArray(parsed.tasks)
      ? (parsed.tasks as PilotTask[])
          .filter(t => t && typeof t.name === 'string' && t.name.trim())
          .slice(0, 5)
          .map(t => ({
            name: String(t.name).trim().slice(0, 90),
            why: String(t.why ?? '').trim().slice(0, 160),
            tier: (t.tier === 'MODERATE' || t.tier === 'EXCELLENT' ? t.tier : 'ESSENTIAL') as PilotTask['tier'],
            quantity: typeof t.quantity === 'number' && t.quantity > 0 ? Math.round(t.quantity) : 1,
            unit: typeof t.unit === 'string' && t.unit.trim() ? t.unit.trim().slice(0, 16) : null,
            kind: normalizeTaskKind((t as { kind?: unknown }).kind),
            source: pt
              ? 'EOS Pilot: dados ao vivo, contexto da família e base RAG quando aplicável'
              : 'EOS Pilot: live data, household context, and RAG when applicable',
            destination: pt
              ? 'Preparação > Recomendações do Pilot'
              : 'Preparedness > Pilot recommendations',
          }))
      : []
    const destinations = Array.isArray(parsed.destinations)
      ? (parsed.destinations as PilotDestination[])
          .filter(
            d =>
              d &&
              typeof d.lat === 'number' &&
              typeof d.lng === 'number' &&
              Number.isFinite(d.lat) &&
              Number.isFinite(d.lng) &&
              Math.abs(d.lat) <= 90 &&
              Math.abs(d.lng) <= 180,
          )
          .slice(0, 4)
          .map(d => ({ label: String(d.label ?? '').trim().slice(0, 60) || 'Destino', lat: d.lat, lng: d.lng }))
      : []
    const memory = Array.isArray(parsed.memory)
      ? (parsed.memory as PilotMemoryProposal[])
          .filter(m => m && typeof m.proposal_md === 'string' && m.proposal_md.trim())
          .slice(0, 2)
          .map(m => ({
            title: String(m.title ?? (pt ? 'Salvar na memória' : 'Save to memory')).trim().slice(0, 80),
            reason: String(m.reason ?? '').trim().slice(0, 180),
            proposal_md: String(m.proposal_md).trim().slice(0, 1200),
          }))
      : []
    return { reply: String(parsed.reply ?? salvageReply(raw)).trim(), tasks, destinations, memory }
  } catch {
    return { reply: salvageReply(raw), tasks: [], destinations: [], memory: [] }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  /**
   * Limite de uso (D-118).
   *
   * Esta é a rota mais cara do produto: modelo forte, embedding, tradução da
   * consulta e RAG, tudo por pergunta. Ela não tinha limite NENHUM, e cadastro é
   * aberto — uma conta podia consumir a fatura da OpenAI sozinha.
   *
   * Duas janelas: a de minuto protege a experiência (um botão preso não vira
   * cem chamadas); a diária protege a FATURA, que nenhuma janela de um minuto
   * detém ao longo de horas.
   *
   * Os números são generosos de propósito: numa emergência de verdade a pessoa
   * VAI perguntar muito, e um copiloto que trava no momento do susto é pior que
   * a fatura que ele evitou.
   */
  const excedeu = await enforceAiBudget(`pilot:${user.id}`, { perMinute: 12, perDay: 200 })
  if (excedeu) {
    const segundos = Math.max(1, Math.ceil((excedeu.result.reset - Date.now()) / 1000))
    return NextResponse.json(
      {
        error: 'rate_limited',
        // A resposta cai no mesmo campo que a UI já sabe mostrar, então o
        // usuário lê uma frase — não um erro cru nem um silêncio.
        reply:
          excedeu.scope === 'day'
            ? 'Você já conversou bastante comigo hoje. O limite diário se renova em algumas horas — o resto do EOS continua funcionando normalmente.'
            : `Muitas perguntas em sequência. Tente de novo em ${segundos}s.`,
        tasks: [],
        destinations: [],
      },
      { status: 200, headers: rateLimitHeaders(excedeu.result) },
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const { messages = [], context } = body
  if (!context || !messages.length) {
    return NextResponse.json({ error: 'messages e context são obrigatórios.' }, { status: 400 })
  }

  const openai = getOpenAIClient()
  if (!openai) {
    return NextResponse.json(
      { error: 'offline', reply: null, tasks: [], destinations: [] },
      { status: 200 },
    )
  }

  const pt = context.pt
  const question = messages[messages.length - 1]?.content ?? ''

  let familyRecord = ''
  let circleRecord = ''
  try {
    const [{ data: profile }, casa, visibleCircleRecord] = await Promise.all([
      supabase
        .from('profiles')
        .select('name, location, blood_type, allergies, emergency_contact_name, emergency_contact_phone, medical_notes, medications')
        .eq('id', user.id)
        .maybeSingle(),
      // A casa (D-123): quem confirmou morar junto + os dependentes de cada um.
      // Antes o Pilot só via a lista digitada à mão do próprio usuário e
      // respondia sobre uma família que podia não ser a que mora ali.
      getHousehold(user.id),
      loadPilotCircleRecord(user.id, pt),
    ])
    familyRecord = buildPilotFamilyRecord({
      profile: profile ?? null,
      members: casa.people.map(p => ({
        name: p.name,
        age: p.age,
        medical_conditions: p.medicalConditions,
        medical_notes: p.careNotes,
        medications: p.medications,
        mobility_impaired: p.mobilityImpaired,
        is_infant: p.isInfant,
      })),
      pt,
    })
    if (casa.needsHidden > 0) {
      // O Pilot precisa saber a diferença entre "ninguém precisa" e "não posso
      // ver". Sem isto ele responderia com confiança sobre uma casa que não
      // conhece — que é o pior jeito de responder sobre remédio.
      familyRecord += pt
        ? `\n(${casa.needsHidden} pessoa(s) da casa não compartilharam a ficha: pode haver necessidade que não aparece aqui.)`
        : `\n(${casa.needsHidden} household member(s) have not shared their record: needs may exist that are not listed here.)`
    }
    circleRecord = visibleCircleRecord
  } catch {
    familyRecord = pt
      ? 'FICHA DA FAMÍLIA: não consegui carregar a ficha detalhada nesta resposta.'
      : 'FAMILY RECORD: could not load the detailed family record for this answer.'
    circleRecord = pt
      ? 'MEMBROS VISÍVEIS DO CÍRCULO: não consegui carregar as fichas do círculo nesta resposta.'
      : 'VISIBLE CIRCLE MEMBERS: could not load circle records for this answer.'
  }

  // Ground the answer in the EOS knowledge base (FEMA, Red Cross, WHO, SAS).
  let knowledge = ''
  try {
    const chunks = await getRelevantChunks(question)
    knowledge = chunks.map(c => (typeof c === 'string' ? c : JSON.stringify(c))).join('\n---\n').slice(0, 6000)
  } catch {
    /* Knowledge is enrichment; the specialist still answers without it. */
  }

  const household = pt
    ? `Pessoas: ${context.people}. Bebês: ${context.hasInfants ? 'sim' : 'não'}. Condições médicas: ${context.hasMedicalConditions ? 'sim' : 'não'}. Mobilidade reduzida: ${context.mobilityImpaired}.`
    : `People: ${context.people}. Infants: ${context.hasInfants ? 'yes' : 'no'}. Medical conditions: ${context.hasMedicalConditions ? 'yes' : 'no'}. Mobility impaired: ${context.mobilityImpaired}.`

  const reserves = pt
    ? `Autonomia ${context.autonomyDays.toFixed(1)} dias (água ${context.waterDays.toFixed(1)}d, comida ${context.foodDays.toFixed(1)}d, energia ${context.powerDays.toFixed(1)}d, combustível ${context.fuelDays.toFixed(1)}d). Checklist ${context.checklistPct}%.`
    : `Autonomy ${context.autonomyDays.toFixed(1)} days (water ${context.waterDays.toFixed(1)}d, food ${context.foodDays.toFixed(1)}d, power ${context.powerDays.toFixed(1)}d, fuel ${context.fuelDays.toFixed(1)}d). Checklist ${context.checklistPct}%.`

  // Real places matching what was asked, with real coordinates.
  const places = await findPlaces(question, context.selfCoords)
  const placesBlock = places.length
    ? (pt
        ? `LUGARES REAIS PERTO DO USUÁRIO, JÁ ORDENADOS DO MAIS PRÓXIMO PARA O MAIS DISTANTE (coordenadas verificadas — copie-as, não invente). Se a pergunta for pelo "mais próximo", a resposta é O PRIMEIRO da lista; não escolha outro:\n` +
          places.map(p => `- ${p.label} (${p.lat.toFixed(5)},${p.lng.toFixed(5)}) a ${p.distanceKm.toFixed(1)} km`).join('\n')
        : `REAL PLACES NEAR THE USER, ALREADY SORTED NEAREST FIRST (verified coordinates — copy them, do not invent). If the question asks for the nearest one, the answer is THE FIRST ITEM; do not pick another:\n` +
          places.map(p => `- ${p.label} (${p.lat.toFixed(5)},${p.lng.toFixed(5)}) ${p.distanceKm.toFixed(1)} km away`).join('\n'))
    : ''

  const system = [
    pt
      ? 'Você é o EOS Pilot: um especialista em preparação e resposta a emergências, falando com o chefe de uma família. Você instrui, não conversa fiado.'
      : 'You are the EOS Pilot: an emergency preparedness and response specialist speaking to the head of a household. You instruct; you do not chat.',
    pt
      ? 'IDIOMA: responda SEMPRE no mesmo idioma da última mensagem do usuário. Se ele escreveu em português, responda em português.'
      : 'LANGUAGE: always answer in the language of the user last message.',
    TONE[context.riskState][pt ? 'pt' : 'en'],
    pt
      ? `SITUAÇÃO: índice de risco ${context.score ?? '—'} (${context.riskState}). ${context.headline}`
      : `SITUATION: risk index ${context.score ?? '—'} (${context.riskState}). ${context.headline}`,
    pt ? `FAMÍLIA: ${household}` : `HOUSEHOLD: ${household}`,
    familyRecord
      ? (pt
          ? `FICHA DA FAMÍLIA QUE VOCÊ PODE USAR AGORA:\n${familyRecord}\n\nSe um campo disser "não consta", trate como dado ausente e não invente.`
          : `FAMILY RECORD YOU MAY USE NOW:\n${familyRecord}\n\nIf a field says "not recorded", treat it as missing and do not invent it.`)
      : '',
    circleRecord
      ? (pt
          ? `FICHAS DO CÍRCULO QUE VOCÊ PODE USAR AGORA:\n${circleRecord}\n\nUse somente campos marcados como compartilhados. Se um campo disser "não compartilhado neste círculo", diga isso claramente e não trate como inexistente.`
          : `CIRCLE RECORDS YOU MAY USE NOW:\n${circleRecord}\n\nUse only fields marked as shared. If a field says "not shared in this circle", say that clearly and do not treat it as nonexistent.`)
      : '',
    pt ? `RECURSOS: ${reserves}` : `RESOURCES: ${reserves}`,
    pt
      ? `DADOS AO VIVO QUE VOCÊ TEM AGORA (leitura real dos sensores e provedores do EOS):\n${situationReport(context)}`
      : `LIVE DATA YOU HAVE RIGHT NOW (real readings from the EOS sensors and providers):\n${situationReport(context)}`,
    pt
      ? 'VOCÊ TEM ACESSO A DADOS EM TEMPO REAL. Eles estão acima. NUNCA diga que não tem acesso a dados em tempo real nem mande o usuário consultar outra fonte de meteorologia — responda com os números acima e cite a hora da leitura quando fizer sentido. Se um dado específico não estiver na lista, diga exatamente qual falta.'
      : 'YOU DO HAVE REAL-TIME DATA. It is above. NEVER say you lack real-time access, and never tell the user to check another weather source — answer with the numbers above and cite the reading time when it matters. If one specific figure is missing from the list, say exactly which one.',
    context.downSources?.length
      ? pt
        ? `INSTRUMENTOS FORA DO AR neste treino: ${context.downSources.join(', ')}. Você está CEGO para esses dados — diga isso explicitamente e oriente o que fazer sem eles (rádio a pilha, vizinhos, sinais físicos). Nunca invente o que a fonte caída diria.`
        : `INSTRUMENTS OFF THE AIR in this drill: ${context.downSources.join(', ')}. You are BLIND to that data — say so explicitly and advise how to cope without it (battery radio, neighbours, physical signs). Never invent what the dead source would have said.`
      : '',
    context.simulated
      ? pt
        ? 'ATENÇÃO: isto é uma SIMULAÇÃO de treino. Trate como real para efeito de instrução, mas nunca diga que há uma emergência de verdade.'
        : 'NOTE: this is a training SIMULATION. Treat it as real for instruction, but never claim a real emergency is happening.'
      : '',
    /**
     * Análise de atividade — a capacidade que só existia na aba Clima.
     *
     * Lá era um endpoint separado com prompt próprio, sem saber nada da casa:
     * dizia se o tempo servia e parava. O Pilot já tem o que aquele não tinha —
     * a família, as reservas, os alertas oficiais, o ciclone, o plano — então a
     * mesma pergunta ("vou trabalhar no telhado") passa a render uma resposta
     * melhor, e não só a mesma noutro lugar.
     *
     * O formato estruturado (veredito, janela, checklist) é copiado de lá porque
     * funciona: quem pergunta se pode subir no telhado quer um SIM/NÃO com hora,
     * não três parágrafos.
     */
    pt
      ? 'QUANDO O USUÁRIO DISSER QUE VAI FAZER ALGO (trabalhar no telhado, cortar árvore, viajar, correr, soltar o barco, deixar a criança na escola), ANALISE A ATIVIDADE em vez de conversar: (a) veredito numa linha — pode, pode com cuidado, ou não faça; (b) POR QUE, citando os números reais que você tem (rajada, UV, chuva por hora, alerta ativo, ciclone); (c) a MELHOR JANELA de hoje, usando a série horária acima, ou diga que não há janela boa; (d) o que muda a resposta ("acima de 40 km/h de rajada, desça"). Trabalho em altura, água, fogo, eletricidade e estrada merecem o cuidado mais duro. Cada precaução concreta vira uma task.'
      : 'WHEN THE USER SAYS THEY ARE GOING TO DO SOMETHING (roof work, tree cutting, driving, running, taking the boat out, school run), ANALYSE THE ACTIVITY instead of chatting: (a) one-line verdict — go, go with care, or do not; (b) WHY, citing the real numbers you have (gusts, UV, hourly rain, active alert, cyclone); (c) the BEST WINDOW today from the hourly series above, or say there is none; (d) what would change the answer ("above 40 km/h gusts, come down"). Work at height, water, fire, electricity and driving get the strictest care. Every concrete precaution becomes a task.',
    pt
      ? 'MODO EDUCADOR SITUACIONAL: instrua em sequência lógica. Quando faltar contexto essencial, faça uma pergunta curta antes de concluir. Quando houver ação concreta, transforme em proposta de preparação; não diga apenas "considere". Classifique cada task com kind: resource para comprar/adquirir, task para fazer/verificar, plan_review para revisar plano familiar, comms_setup para rádio/comunicação.'
      : 'SITUATIONAL EDUCATOR MODE: instruct in a logical sequence. When essential context is missing, ask one short question before concluding. When there is a concrete action, turn it into a preparedness proposal; do not only say "consider". Classify each task with kind: resource for acquiring supplies, task for doing/checking, plan_review for reviewing the family plan, comms_setup for radio/communication setup.',
    pt
      ? 'MEMÓRIA DO PILOT: se o usuário disser uma preferência, restrição, rotina, equipamento recorrente, tolerância de risco, pessoa/necessidade familiar ou regra pessoal que será útil no futuro, proponha em memory. Não escreva como fato absoluto se foi incerto. Memory é proposta, não escrita automática.'
      : 'PILOT MEMORY: if the user states a preference, constraint, routine, recurring equipment, risk tolerance, family need, or personal rule that will be useful later, propose it in memory. Do not write uncertain statements as absolute facts. Memory is a proposal, not an automatic write.',

    placesBlock,
    knowledge
      ? (pt ? `BASE DE CONHECIMENTO (use e cite quando útil):\n${knowledge}` : `KNOWLEDGE BASE (use and cite when useful):\n${knowledge}`)
      : '',
    pt
      ? 'CICLONE: ao citar qualquer tempestade tropical, diga SEMPRE, na mesma frase, se ela pode ou não afetar a pessoa — a qualificação já vem calculada nos dados acima ("PODE AFETAR" ou "longe demais"). Uma tempestade distante nunca deve ser apresentada como ameaça, e uma próxima nunca deve ser minimizada. Use o ponto cardeal do rumo, não os graus.'
      : 'CYCLONE: whenever you mention a tropical storm, say IN THE SAME SENTENCE whether it can affect this person — the qualification is already computed in the data above ("COULD AFFECT" or "too far"). A distant storm must never be presented as a threat, and a near one must never be downplayed. Use the cardinal heading, not the degrees.',
    pt
      ? 'ATIVIDADE vs RESERVAS: o veredito sobre uma atividade depende das condições que afetam AQUELA atividade — rajada, chuva, raio, UV, visibilidade, alerta oficial. O estoque da casa (água, comida, checklist) NÃO entra nesse veredito: ninguém deixa de subir no telhado porque tem pouca água guardada. Não vete uma atividade sem um número que justifique o veto; rajada baixa e céu limpo significam "pode".'
      : 'ACTIVITY vs RESERVES: the verdict on an activity depends on the conditions affecting THAT activity — gusts, rain, lightning, UV, visibility, official alerts. Household stock (water, food, checklist) does NOT belong in that verdict: nobody skips roof work because their water store is low. Never veto an activity without a number that justifies it; low gusts and clear sky mean "go".',
    pt
      ? 'REGRAS INEGOCIÁVEIS: 1) Nunca invente abrigo, rota ou ordem de evacuação — evacuação só existe se houver ordem oficial. 2) Use os números reais da família acima; nada de conselho genérico. 3) Se faltar dado, diga que falta. 4) Nunca suavize um risco crítico. 5) NUNCA calcule distância, rumo ou coordenada por conta própria — use apenas os números já fornecidos acima. Ao mencionar direção ou distância, **copie o valor exato** que foi dado (ex.: "34.0 km a NO"); nunca parafraseie para outra direção nem arredonde o rumo. 6) Só cite posição de quem aparece na lista de posições consentidas.'
      : 'NON-NEGOTIABLE RULES: 1) Never invent a shelter, route or evacuation order — evacuation exists only under an official order. 2) Use the real household numbers above; no generic advice. 3) If data is missing, say so. 4) Never soften a critical risk. 5) NEVER compute a distance, bearing or coordinate yourself — use only the numbers given above. When mentioning a direction or distance, **copy the exact value** you were given (e.g. "34.0 km NW"); never paraphrase it into a different direction or round the bearing. 6) Only cite the position of people who appear in the consented positions list.',
    pt
      ? 'Responda no mesmo idioma em que o usuário escreveu. RESPONDA SOMENTE com JSON: {"reply":"sua resposta","tasks":[{"name":"ação curta e executável","why":"por que","kind":"resource|task|plan_review|comms_setup","tier":"ESSENTIAL|MODERATE|EXCELLENT","quantity":1,"unit":null}],"memory":[{"title":"memória curta","reason":"por que isso ajuda no futuro","proposal_md":"- Preferência/regra/necessidade em Markdown"}],"destinations":[{"label":"nome do lugar","lat":0,"lng":0}]}. Inclua em tasks TODA ação concreta que você recomendar. Use memory somente para preferências/necessidades duráveis. Inclua em destinations TODO lugar para onde valha a pena ir — copiando as coordenadas exatas da lista acima, nunca inventando. Se não houver, use [].'
      : 'Reply in the language the user wrote in. ANSWER ONLY with JSON: {"reply":"your answer","tasks":[{"name":"short executable action","why":"why","kind":"resource|task|plan_review|comms_setup","tier":"ESSENTIAL|MODERATE|EXCELLENT","quantity":1,"unit":null}],"memory":[{"title":"short memory","reason":"why this helps later","proposal_md":"- Preference/rule/need in Markdown"}],"destinations":[{"label":"place name","lat":0,"lng":0}]}. Put EVERY concrete action into tasks. Use memory only for durable preferences/needs. Put in destinations EVERY place worth travelling to — copying exact coordinates from the list above, never inventing them. Use [] when there are none.',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const model = getOpenAIModel()
    const payload = {
      model,
      messages: [
        { role: 'system' as const, content: system },
        ...messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
      ],
      // Os parâmetros dependem da família do modelo: os de raciocínio recusam
      // `max_tokens` e gastam o orçamento pensando antes de escrever.
      ...generationParams(model, {
        maxOutputTokens: 1400,   // subiu porque objeto truncado vazava JSON cru na tela
        temperature: context.riskState === 'critical' ? 0.2 : 0.5,
      }),
    }

    let completion
    try {
      // Provider-enforced JSON beats hoping the model closes its own braces.
      completion = await openai.chat.completions.create({
        ...payload,
        response_format: { type: 'json_object' },
      })
    } catch {
      completion = await openai.chat.completions.create(payload)
    }

    const raw = completion.choices[0]?.message?.content ?? ''
    const { reply, tasks, destinations, memory } = extractJson(raw, pt)
    return NextResponse.json({ reply, tasks, destinations, memory })
  } catch (error) {
    // Antes este catch era mudo: a rota devolvia "unavailable" e o defeito
    // morria ali. Agora fica registrado — a resposta ao usuário não muda.
    await logError('api/pilot/chat', error, {
      userId: user.id,
      context: { model: getOpenAIModel(), riskState: context.riskState },
    })
    return NextResponse.json({ error: 'unavailable', reply: null, tasks: [], destinations: [] }, { status: 200 })
  }
}
