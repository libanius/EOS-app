import type { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { getOpenAIModel } from '@/lib/openai'
import { getRelevantChunks } from '@/lib/knowledge'
import { enforceRateLimit, rateLimitHeaders } from '@/lib/rate-limit'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IntelligenceResponse {
  mode: 'CONNECTED' | 'LOCAL_AI' | 'SURVIVAL'
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  risks: string[]
  immediate_actions: string[]
  short_term_actions: string[]
  mid_term_actions: string[]
  rulesApplied: string[]
  knowledgeSources: string[]
  raw_text?: string
  action_plan_id?: string
}

interface AnalyzeRequest {
  scenario: string
  scenarioType: string
}

interface Profile {
  id: string
  name: string
  location: string
}

interface FamilyMember {
  id: string
  name: string
  age: number | null
  medical_conditions: string[]
  medical_notes: string | null
  medications: string[]
  mobility_impaired: boolean
  is_infant: boolean
}

interface ResourceInventory {
  water_liters: number
  food_days: number
  fuel_liters: number
  battery_percent: number
  has_medical_kit: boolean
  has_communication_device: boolean
}

interface RulesResult {
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  risks: string[]
  actions: string[]
  rulesApplied: string[]
}

interface QueryContext {
  scenario: string
  scenarioType: string
  profile: Profile
  family: FamilyMember[]
  inventory: ResourceInventory
}

// ─── Rules Engine ────────────────────────────────────────────────────────────

class RulesEngine {
  static evaluate(ctx: QueryContext): RulesResult {
    const result: RulesResult = {
      priority: 'LOW',
      risks: [],
      actions: [],
      rulesApplied: [],
    }

    const { inventory, family, scenarioType } = ctx
    const memberCount = Math.max(family.length, 1)
    const hasChildren = family.some((m) => m.age !== null && m.age < 18)
    const hasInfants = family.some((m) => m.is_infant)
    const hasMedical = family.some(
      (m) => m.medical_conditions && m.medical_conditions.length > 0
    )
    const hasElders = family.some((m) => m.age !== null && m.age > 65)
    const hasMobilityImpaired = family.some((m) => m.mobility_impaired === true)

    // Water rules (per person)
    const waterPerPerson = inventory.water_liters / memberCount
    if (waterPerPerson < 2) {
      result.priority = 'CRITICAL'
      result.risks.push('Água abaixo de 2L/pessoa — risco imediato de desidratação')
      result.actions.push('Localizar fonte de água potável imediatamente')
      result.rulesApplied.push('WATER_CRITICAL: < 2L/pessoa')
    } else if (waterPerPerson < 4) {
      result.priority = escalate(result.priority, 'HIGH')
      result.risks.push(`Reserva de água insuficiente para ${memberCount} pessoa(s) por 2 dias`)
      result.actions.push('Racionar água: máximo 2L/pessoa/dia')
      result.rulesApplied.push('WATER_LOW: < 4L/pessoa')
    }

    // Food rules
    if (inventory.food_days < 1) {
      result.priority = escalate(result.priority, 'CRITICAL')
      result.risks.push('Sem reserva de alimentos')
      result.actions.push('Localizar fonte de alimentação ou abrigo de emergência')
      result.rulesApplied.push('FOOD_CRITICAL: food_days < 1')
    } else if (inventory.food_days < 3) {
      result.priority = escalate(result.priority, 'HIGH')
      result.risks.push(`Menos de 3 dias de comida para ${memberCount} pessoa(s)`)
      result.rulesApplied.push('FOOD_LOW: food_days < 3')
    }

    // Vulnerable population rules
    if (hasInfants) {
      result.priority = escalate(result.priority, 'CRITICAL')
      result.risks.push('Bebê(s) presente(s) — demandas especiais de hidratação e alimentação')
      result.actions.push('Garantir fórmula/leite e fraldas para 72h mínimo')
      result.rulesApplied.push('INFANT_PRESENT')
    }

    if (hasChildren) {
      result.priority = escalate(result.priority, 'HIGH')
      result.risks.push('Crianças presentes — prioridade de evacuação elevada')
      result.actions.push('Manter crianças hidratadas e próximas a adultos responsáveis')
      result.rulesApplied.push('CHILDREN_PRESENT: age < 18')
    }

    if (hasMedical) {
      result.priority = escalate(result.priority, 'HIGH')
      result.risks.push('Membro(s) com condição médica — verificar medicações')
      result.actions.push('Verificar estoque de medicamentos essenciais para 7 dias')
      result.rulesApplied.push('MEDICAL_CONDITIONS')
    }

    if (hasElders) {
      result.risks.push('Idosos presentes — mobilidade e temperatura são fatores críticos')
      result.rulesApplied.push('ELDERLY_PRESENT: age > 65')
    }

    if (hasMobilityImpaired) {
      result.priority = escalate(result.priority, 'HIGH')
      result.risks.push('Mobilidade reduzida — plano de evacuação adaptado necessário')
      result.actions.push('Preparar rota de evacuação acessível com antecedência')
      result.rulesApplied.push('MOBILITY_IMPAIRED')
    }

    // Scenario-specific rules
    const type = scenarioType.toLowerCase()

    if (type === 'hurricane') {
      result.actions.push('Proteger janelas e reforçar portas antes da chegada')
      result.rulesApplied.push('SCENARIO_HURRICANE: secure_structure')
    }

    if (type === 'fallout') {
      result.priority = escalate(result.priority, 'CRITICAL')
      result.risks.push('Contaminação por radiação — abrigo imediato essencial')
      result.actions.push('Selar portas e janelas com fita e plástico')
      result.actions.push('Desligar ventilação e ar condicionado imediatamente')
      result.rulesApplied.push('SCENARIO_FALLOUT: shelter_in_place_critical')
    }

    if (type === 'pandemic') {
      result.actions.push('Isolar membros sintomáticos em cômodo separado')
      result.rulesApplied.push('SCENARIO_PANDEMIC: isolation_protocol')
    }

    // Battery/power rules
    if (inventory.battery_percent < 20) {
      result.risks.push('Energia de reserva crítica — risco de perda de comunicação')
      result.actions.push('Conservar bateria: desligar dispositivos não essenciais')
      result.rulesApplied.push('BATTERY_LOW: battery_percent < 20')
    }

    // No medical kit
    if (!inventory.has_medical_kit) {
      result.risks.push('Kit médico ausente')
      result.actions.push('Identificar suprimentos médicos alternativos disponíveis')
      result.rulesApplied.push('NO_MEDICAL_KIT')
    }

    // Default if nothing triggered
    if (result.rulesApplied.length === 0) {
      result.actions.push('Monitorar situação e manter comunicação com família')
      result.rulesApplied.push('DEFAULT: no_critical_conditions')
    }

    return result
  }
}

function escalate(
  current: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
  next: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
  return order[next] > order[current] ? next : current
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildSystemPrompt(
  ctx: QueryContext,
  rulesResult: RulesResult,
  knowledgeChunks: string[]
): string {
  const { profile, family, inventory, scenario, scenarioType } = ctx

  const familySummary = family.length
    ? family
        .map((m) => {
          const flags = [
            m.is_infant ? 'bebê' : m.age !== null && m.age < 18 ? 'criança' : m.age !== null && m.age > 65 ? 'idoso' : 'adulto',
            m.medical_conditions.length > 0 ? `condições: ${m.medical_conditions.join(', ')}` : null,
            m.medical_notes ? `obs: ${m.medical_notes}` : null,
            m.medications.length > 0 ? `medicamentos: ${m.medications.join(', ')}` : null,
            m.mobility_impaired ? 'mobilidade reduzida' : null,
          ]
            .filter(Boolean)
            .join(', ')
          return `- ${m.name} (${m.age ?? '?'} anos, ${flags})`
        })
        .join('\n')
    : '- Nenhum membro de família cadastrado'

  const knowledgeContext = knowledgeChunks.length
    ? knowledgeChunks.join('\n\n---\n\n')
    : 'Nenhum chunk de conhecimento disponível.'

  const criticalWarning =
    rulesResult.priority === 'CRITICAL'
      ? '\n⚠️ PRIORIDADE CRÍTICA — Rules Engine detectou condições de risco de vida. Seu plano deve endereçar isso PRIMEIRO.\n'
      : ''

  return `Você é EOS — Emergency Operating System. Você gera planos de ação de sobrevivência estruturados, prescritivose específicos.

REGRAS DETERMINÍSTICAS (não podem ser alteradas pelo LLM):
Prioridade: ${rulesResult.priority}
Regras ativadas: ${rulesResult.rulesApplied.join(', ')}
Riscos identificados: ${rulesResult.risks.join('; ')}
${criticalWarning}
PERFIL DA FAMÍLIA:
Nome: ${profile.name}
Localização: ${profile.location || 'Não informada'}
Membros:
${familySummary}

INVENTÁRIO ATUAL:
Água: ${inventory.water_liters}L | Comida: ${inventory.food_days} dias | Combustível: ${inventory.fuel_liters}L | Bateria: ${inventory.battery_percent}% | Kit médico: ${inventory.has_medical_kit ? 'Sim' : 'Não'} | Comunicação: ${inventory.has_communication_device ? 'Sim' : 'Não'}

CENÁRIO: ${scenario}
TIPO: ${scenarioType}

BASE DE CONHECIMENTO:
${knowledgeContext}

FORMATO DE SAÍDA — responda APENAS nesta estrutura exata, sem markdown:

PRIORITY: [CRITICAL|HIGH|MEDIUM|LOW]

RISKS:
- [risco 1]
- [risco 2]

IMMEDIATE (15 min):
- [ação 1]
- [ação 2]
- [ação 3]

SHORT TERM (1 hour):
- [ação 1]
- [ação 2]

MID TERM (3 hours):
- [ação 1]
- [ação 2]

Regras: nunca dê conselhos vagos. Cada ação deve ser específica e executável. Quantidades onde relevante. Priorize os membros mais vulneráveis da família primeiro.`
}

// ─── Response Parser ──────────────────────────────────────────────────────────

function parseStructuredResponse(
  text: string,
  mode: 'CONNECTED' | 'LOCAL_AI' | 'SURVIVAL',
  rulesResult: RulesResult
): IntelligenceResponse {
  try {
    const extractList = (section: string): string[] => {
      const regex = new RegExp(`${section}[:\\n]+([\\s\\S]*?)(?=\\n[A-Z]|$)`)
      const match = text.match(regex)
      if (!match) return []
      return match[1]
        .split('\n')
        .map((l) => l.replace(/^[-•*]\s*/, '').trim())
        .filter((l) => l.length > 0)
    }

    const priorityMatch = text.match(/PRIORITY:\s*(CRITICAL|HIGH|MEDIUM|LOW)/)
    const llmPriority = (priorityMatch?.[1] ?? rulesResult.priority) as IntelligenceResponse['priority']

    // Rules Engine priority cannot be downgraded by LLM
    const finalPriority = escalate(llmPriority, rulesResult.priority)

    return {
      mode,
      priority: finalPriority,
      risks: extractList('RISKS').length ? extractList('RISKS') : rulesResult.risks,
      immediate_actions: extractList('IMMEDIATE'),
      short_term_actions: extractList('SHORT TERM'),
      mid_term_actions: extractList('MID TERM'),
      rulesApplied: rulesResult.rulesApplied,
      knowledgeSources: [],
    }
  } catch {
    return {
      mode,
      priority: rulesResult.priority,
      risks: rulesResult.risks,
      immediate_actions: [text.slice(0, 500)],
      short_term_actions: [],
      mid_term_actions: [],
      rulesApplied: rulesResult.rulesApplied,
      knowledgeSources: [],
      raw_text: text,
    }
  }
}

// ─── Survival Fallback ────────────────────────────────────────────────────────

function buildSurvivalResponse(rulesResult: RulesResult): IntelligenceResponse {
  return {
    mode: 'SURVIVAL',
    priority: rulesResult.priority,
    risks: rulesResult.risks,
    immediate_actions: rulesResult.actions.length
      ? rulesResult.actions
      : ['Monitorar situação. Manter comunicação com família.'],
    short_term_actions: [],
    mid_term_actions: [],
    rulesApplied: rulesResult.rulesApplied,
    knowledgeSources: ['Rules Engine (offline)'],
  }
}

// ─── Priority string → smallint mapping (matches action_plans.priority schema) ─

const PRIORITY_INT: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Auth via SSR cookie session (same pattern as all other routes)
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 1b. Rate limit — 10 req / 60 s / user
  {
    const rl = await enforceRateLimit(`analyze:${user.id}`)
    if (!rl.success) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', ...rateLimitHeaders(rl) },
        }
      )
    }
  }

  // 2. Validate body
  let body: AnalyzeRequest
  try {
    body = await request.json()
    if (!body.scenario || typeof body.scenario !== 'string') throw new Error('scenario required')
    if (!body.scenarioType || typeof body.scenarioType !== 'string') throw new Error('scenarioType required')
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Bad Request', detail: e instanceof Error ? e.message : 'Invalid body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // 3. Fetch profile + family + inventory
  // profiles.id = auth.uid(); family_members and resource_inventory use profile_id
  const [profileRes, familyRes, inventoryRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('family_members').select('*').eq('profile_id', user.id),
    supabase.from('resource_inventory').select('*').eq('profile_id', user.id).maybeSingle(),
  ])

  const profile: Profile = profileRes.data
    ? { id: profileRes.data.id, name: profileRes.data.name, location: profileRes.data.location ?? '' }
    : { id: user.id, name: 'Unknown', location: '' }

  const family: FamilyMember[] = (familyRes.data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    age: m.age ?? null,
    medical_conditions: m.medical_conditions ?? [],
    medical_notes: m.medical_notes ?? null,
    medications: m.medications ?? [],
    mobility_impaired: m.mobility_impaired ?? false,
    is_infant: m.is_infant ?? false,
  }))

  const inv = inventoryRes.data
  const inventory: ResourceInventory = {
    water_liters: Number(inv?.water_liters) || 0,
    food_days: Number(inv?.food_days) || 0,
    fuel_liters: Number(inv?.fuel_liters) || 0,
    battery_percent: Number(inv?.battery_percent) || 0,
    has_medical_kit: Boolean(inv?.has_medical_kit),
    has_communication_device: Boolean(inv?.has_communication_device),
  }

  const ctx: QueryContext = {
    scenario: body.scenario,
    scenarioType: body.scenarioType,
    profile,
    family,
    inventory,
  }

  // 4. Rules Engine — ALWAYS before LLM
  const rulesResult = RulesEngine.evaluate(ctx)

  // 5. Knowledge retrieval
  const knowledgeChunks = await getRelevantChunks(body.scenario, body.scenarioType)

  // 6. Build system prompt
  const systemPrompt = buildSystemPrompt(ctx, rulesResult, knowledgeChunks)

  // 7. Stream response
  const encoder = new TextEncoder()
  const TIMEOUT_MS = 30_000

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      let fullText = ''
      let timedOut = false
      let finalResponse: IntelligenceResponse | null = null

      const timeout = setTimeout(() => {
        timedOut = true
        send({ done: true, response: buildSurvivalResponse(rulesResult) })
        controller.close()
      }, TIMEOUT_MS)

      const tryCallLLM = async (attempt: number): Promise<boolean> => {
        try {
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

          const llmStream = await openai.chat.completions.stream({
            model: getOpenAIModel(),
            max_tokens: 1500,
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: `Cenário de emergência: \${body.scenario}\nTipo: \${body.scenarioType}\n\nGere o plano de ação agora.`,
              },
            ],
          })

          for await (const chunk of llmStream) {
            if (timedOut) return false
            const token = chunk.choices[0]?.delta?.content ?? ''
            if (token) {
              fullText += token
              send({ token })
            }
          }

          return true
        } catch (err: unknown) {
          const status =
            err instanceof Error && 'status' in err ? (err as { status: number }).status : 0
          // Rate limit: retry once after 1s
          if (status === 429 && attempt === 1) {
            await new Promise((r) => setTimeout(r, 1000))
            return tryCallLLM(2)
          }
          return false
        }
      }

      const success = await tryCallLLM(1)

      if (timedOut) return

      clearTimeout(timeout)

      if (success && fullText) {
        finalResponse = parseStructuredResponse(fullText, 'CONNECTED', rulesResult)
        finalResponse.knowledgeSources = knowledgeChunks.length > 0
          ? ['Knowledge Base (pgvector RAG)']
          : ['Rules Engine (offline)']

        // 8. Persist scenario + action plan (non-blocking; failure does not propagate)
        try {
          const scenarioType = body.scenarioType.toUpperCase() as
            | 'HURRICANE' | 'EARTHQUAKE' | 'FALLOUT' | 'PANDEMIC' | 'FIRE' | 'FLOOD' | 'GENERAL'

          const { data: scenarioRow } = await supabase
            .from('scenarios')
            .insert({ profile_id: user.id, description: body.scenario, type: scenarioType })
            .select('id')
            .single()

          if (scenarioRow?.id) {
            const { data: plan } = await supabase
              .from('action_plans')
              .insert({
                scenario_id: scenarioRow.id,
                mode: finalResponse.mode,
                priority: PRIORITY_INT[finalResponse.priority] ?? 1,
                risks: finalResponse.risks,
                immediate_actions: finalResponse.immediate_actions,
                short_term_actions: finalResponse.short_term_actions,
                mid_term_actions: finalResponse.mid_term_actions,
                rules_applied: finalResponse.rulesApplied,
              })
              .select('id')
              .single()

            if (plan?.id) finalResponse.action_plan_id = plan.id
          }
        } catch {
          console.error('[EOS] Failed to persist action_plan')
        }
      } else {
        finalResponse = buildSurvivalResponse(rulesResult)
      }

      send({ done: true, response: finalResponse })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
