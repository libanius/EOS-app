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
  }
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

function extractJson(raw: string): { reply: string; tasks: PilotTask[] } {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return { reply: raw.trim(), tasks: [] }
  try {
    const parsed = JSON.parse(match[0]) as { reply?: string; tasks?: unknown }
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
    return { reply: String(parsed.reply ?? raw).trim(), tasks }
  } catch {
    return { reply: raw.trim(), tasks: [] }
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
      { error: 'offline', reply: null, tasks: [] },
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

  const system = [
    pt
      ? 'Você é o EOS Pilot: um especialista em preparação e resposta a emergências, falando com o chefe de uma família. Você instrui, não conversa fiado.'
      : 'You are the EOS Pilot: an emergency preparedness and response specialist speaking to the head of a household. You instruct; you do not chat.',
    TONE[context.riskState][pt ? 'pt' : 'en'],
    pt
      ? `SITUAÇÃO: índice de risco ${context.score ?? '—'} (${context.riskState}). ${context.headline}`
      : `SITUATION: risk index ${context.score ?? '—'} (${context.riskState}). ${context.headline}`,
    pt ? `FAMÍLIA: ${household}` : `HOUSEHOLD: ${household}`,
    pt ? `RECURSOS: ${reserves}` : `RESOURCES: ${reserves}`,
    context.simulated
      ? pt
        ? 'ATENÇÃO: isto é uma SIMULAÇÃO de treino. Trate como real para efeito de instrução, mas nunca diga que há uma emergência de verdade.'
        : 'NOTE: this is a training SIMULATION. Treat it as real for instruction, but never claim a real emergency is happening.'
      : '',
    knowledge
      ? (pt ? `BASE DE CONHECIMENTO (use e cite quando útil):\n${knowledge}` : `KNOWLEDGE BASE (use and cite when useful):\n${knowledge}`)
      : '',
    pt
      ? 'REGRAS INEGOCIÁVEIS: 1) Nunca invente abrigo, rota ou ordem de evacuação — evacuação só existe se houver ordem oficial. 2) Use os números reais da família acima; nada de conselho genérico. 3) Se faltar dado, diga que falta. 4) Nunca suavize um risco crítico.'
      : 'NON-NEGOTIABLE RULES: 1) Never invent a shelter, route or evacuation order — evacuation exists only under an official order. 2) Use the real household numbers above; no generic advice. 3) If data is missing, say so. 4) Never soften a critical risk.',
    pt
      ? 'RESPONDA SOMENTE com JSON: {"reply":"sua resposta","tasks":[{"name":"ação curta e executável","why":"por que","tier":"ESSENTIAL|MODERATE|EXCELLENT","quantity":1,"unit":null}]}. Inclua em tasks TODA ação concreta que você recomendar (ex.: "Abastecer o carro" vira task). Se não recomendar ação, tasks é [].'
      : 'ANSWER ONLY with JSON: {"reply":"your answer","tasks":[{"name":"short executable action","why":"why","tier":"ESSENTIAL|MODERATE|EXCELLENT","quantity":1,"unit":null}]}. Put EVERY concrete action you recommend into tasks. If you recommend none, tasks is [].',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const completion = await openai.chat.completions.create({
      model: getOpenAIModel(),
      messages: [
        { role: 'system', content: system },
        ...messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
      ],
      temperature: context.riskState === 'critical' ? 0.2 : 0.5,
      max_tokens: 700,
    })

    const raw = completion.choices[0]?.message?.content ?? ''
    const { reply, tasks } = extractJson(raw)
    return NextResponse.json({ reply, tasks })
  } catch {
    return NextResponse.json({ error: 'unavailable', reply: null, tasks: [] }, { status: 200 })
  }
}
