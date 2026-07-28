import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIClient, getOpenAIModel } from '@/lib/openai'
import { getRelevantChunks } from '@/lib/knowledge'

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

  const d = 0.6 // degrees — a metro-area window, not the whole state
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '5',
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

const toC = (f: number) => Math.round(((f - 32) * 5) / 9)
const toKmh = (mph: number) => Math.round(mph * 1.609)
const toKm = (mi: number) => (mi * 1.609).toFixed(1)

/**
 * The live situation, rendered for the model. This block is the difference
 * between a specialist and a chatbot: without it the model truthfully answers
 * that it has no real-time access, which is exactly the wrong answer when the
 * app is holding a current weather snapshot.
 */
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

function extractJson(raw: string): { reply: string; tasks: PilotTask[]; destinations: PilotDestination[] } {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return { reply: salvageReply(raw), tasks: [], destinations: [] }
  try {
    const parsed = JSON.parse(match[0]) as { reply?: string; tasks?: unknown; destinations?: unknown }
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
    return { reply: String(parsed.reply ?? salvageReply(raw)).trim(), tasks, destinations }
  } catch {
    return { reply: salvageReply(raw), tasks: [], destinations: [] }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

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
        ? `LUGARES REAIS ENCONTRADOS PERTO DO USUÁRIO para esta pergunta (coordenadas verificadas — copie-as, não invente):\n` +
          places.map(p => `- ${p.label} (${p.lat.toFixed(5)},${p.lng.toFixed(5)}) a ${p.distanceKm.toFixed(1)} km`).join('\n')
        : `REAL PLACES FOUND NEAR THE USER for this question (verified coordinates — copy them, do not invent):\n` +
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
    pt ? `RECURSOS: ${reserves}` : `RESOURCES: ${reserves}`,
    pt
      ? `DADOS AO VIVO QUE VOCÊ TEM AGORA (leitura real dos sensores e provedores do EOS):\n${situationReport(context)}`
      : `LIVE DATA YOU HAVE RIGHT NOW (real readings from the EOS sensors and providers):\n${situationReport(context)}`,
    pt
      ? 'VOCÊ TEM ACESSO A DADOS EM TEMPO REAL. Eles estão acima. NUNCA diga que não tem acesso a dados em tempo real nem mande o usuário consultar outra fonte de meteorologia — responda com os números acima e cite a hora da leitura quando fizer sentido. Se um dado específico não estiver na lista, diga exatamente qual falta.'
      : 'YOU DO HAVE REAL-TIME DATA. It is above. NEVER say you lack real-time access, and never tell the user to check another weather source — answer with the numbers above and cite the reading time when it matters. If one specific figure is missing from the list, say exactly which one.',
    context.simulated
      ? pt
        ? 'ATENÇÃO: isto é uma SIMULAÇÃO de treino. Trate como real para efeito de instrução, mas nunca diga que há uma emergência de verdade.'
        : 'NOTE: this is a training SIMULATION. Treat it as real for instruction, but never claim a real emergency is happening.'
      : '',
    placesBlock,
    knowledge
      ? (pt ? `BASE DE CONHECIMENTO (use e cite quando útil):\n${knowledge}` : `KNOWLEDGE BASE (use and cite when useful):\n${knowledge}`)
      : '',
    pt
      ? 'REGRAS INEGOCIÁVEIS: 1) Nunca invente abrigo, rota ou ordem de evacuação — evacuação só existe se houver ordem oficial. 2) Use os números reais da família acima; nada de conselho genérico. 3) Se faltar dado, diga que falta. 4) Nunca suavize um risco crítico. 5) NUNCA calcule distância, rumo ou coordenada por conta própria — use apenas os números já fornecidos acima. Ao mencionar direção ou distância, **copie o valor exato** que foi dado (ex.: "34.0 km a NO"); nunca parafraseie para outra direção nem arredonde o rumo. 6) Só cite posição de quem aparece na lista de posições consentidas.'
      : 'NON-NEGOTIABLE RULES: 1) Never invent a shelter, route or evacuation order — evacuation exists only under an official order. 2) Use the real household numbers above; no generic advice. 3) If data is missing, say so. 4) Never soften a critical risk. 5) NEVER compute a distance, bearing or coordinate yourself — use only the numbers given above. When mentioning a direction or distance, **copy the exact value** you were given (e.g. "34.0 km NW"); never paraphrase it into a different direction or round the bearing. 6) Only cite the position of people who appear in the consented positions list.',
    pt
      ? 'Responda no mesmo idioma em que o usuário escreveu. RESPONDA SOMENTE com JSON: {"reply":"sua resposta","tasks":[{"name":"ação curta e executável","why":"por que","tier":"ESSENTIAL|MODERATE|EXCELLENT","quantity":1,"unit":null}],"destinations":[{"label":"nome do lugar","lat":0,"lng":0}]}. Inclua em tasks TODA ação concreta que você recomendar. Inclua em destinations TODO lugar para onde valha a pena ir — copiando as coordenadas exatas da lista acima, nunca inventando — para que o usuário possa iniciar a navegação com um toque. Se não houver, use [].'
      : 'Reply in the language the user wrote in. ANSWER ONLY with JSON: {"reply":"your answer","tasks":[{"name":"short executable action","why":"why","tier":"ESSENTIAL|MODERATE|EXCELLENT","quantity":1,"unit":null}],"destinations":[{"label":"place name","lat":0,"lng":0}]}. Put EVERY concrete action into tasks. Put in destinations EVERY place worth travelling to — copying the exact coordinates from the list above, never inventing them — so the user can start navigation with one tap. Use [] when there are none.',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const payload = {
      model: getOpenAIModel(),
      messages: [
        { role: 'system' as const, content: system },
        ...messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
      ],
      temperature: context.riskState === 'critical' ? 0.2 : 0.5,
      // Raised because a truncated object is what leaked raw JSON to the screen.
      max_tokens: 1400,
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
    const { reply, tasks, destinations } = extractJson(raw)
    return NextResponse.json({ reply, tasks, destinations })
  } catch {
    return NextResponse.json({ error: 'unavailable', reply: null, tasks: [], destinations: [] }, { status: 200 })
  }
}
