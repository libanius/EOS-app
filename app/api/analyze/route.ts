import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
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
  age: number
  medical_conditions: string | null
  mobility: string | null
  priority: boolean
}

interface ResourceInventory {
  water_liters: number
  food_days: number
  fuel: number
  battery: number
  medical_kit: boolean
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
    const hasChildren = family.some((m) => m.age < 18)
    const hasMedical = family.some((m) => m.medical_conditions)
    const hasElders = family.some((m) => m.age > 65)
    const hasLowMobility = family.some(
      (m) => m.mobility && m.mobility !== 'full'
    )

    // Water rules
    if (inventory.water_liters < 2) {
      result.priority = 'CRITICAL'
      result.risks.push('Água abaixo de 2L — risco imediato de desidratação')
      result.actions.push('Localizar fonte de água potável imediatamente')
      result.rulesApplied.push('WATER_CRITICAL: water_liters < 2')
    } else if (inventory.water_liters < 4 * family.length) {
      result.priority = escalate(result.priority, 'HIGH')
      result.risks.push(`Reserva de água insuficiente para ${family.length} pessoas por 2 dias`)
      result.actions.push('Racionar água: máximo 2L/pessoa/dia')
      result.rulesApplied.push('WATER_LOW: water_liters < 4 * family_size')
    }

    // Food rules
    if (inventory.food_days < 1) {
      result.priority = escalate(result.priority, 'CRITICAL')
      result.risks.push('Sem reserva de alimentos')
      result.actions.push('Localizar fonte de alimentação ou abrigo de emergência')
      result.rulesApplied.push('FOOD_CRITICAL: food_days < 1')
    } else if (inventory.food_days < 3) {
      result.priority = escalate(result.priority, 'HIGH')
      result.risks.push(`Menos de 3 dias de comida para ${family.length} pessoas`)
      result.rulesApplied.push('FOOD_LOW: food_days < 3')
    }

    // Vulnerable population rules
    if (hasChildren) {
      result.priority = escalate(result.priority, 'HIGH')
      result.risks.push('Crianças presentes — prioridade de evacuação elevada')
      result.actions.push('Manter crianças hidratadas e próximas a adultos responsáveis')
      result.rulesApplied.push('CHILDREN_PRESENT: age < 18')
    }

    if (hasMedical) {
      result.priority = escalate(result.priority, 'HIGH')
      result.risks.push('Membro(s) com condição médica — verificar medicações')
      result.actions.push('Verificar estoque de medicamentos essenciais')
      result.rulesApplied.push('MEDICAL_CONDITIONS: family_member has conditions')
    }

    if (hasElders) {
      result.risks.push('Idosos presentes — mobilidade e calor/frio são fatores críticos')
      result.rulesApplied.push('ELDERLY_PRESENT: age > 65')
    }

    if (hasLowMobility) {
      result.priority = escalate(result.priority, 'HIGH')
      result.risks.push('Mobilidade reduzida — plano de evacuação adaptado necessário')
      result.actions.push('Preparar rota de evacuação acessível')
      result.rulesApplied.push('LOW_MOBILITY: mobility != full')
    }

    // Scenario-specific rules
    if (scenarioType === 'hurricane') {
      result.actions.push('Proteger janelas e reforçar portas antes da chegada')
      result.rulesApplied.push('SCENARIO_HURRICANE: secure_structure')
    }

    if (scenarioType === 'fallout') {
      result.priority = escalate(result.priority, 'CRITICAL')
      result.risks.push('Contaminação por radiação — abrigo imediato essencial')
      result.actions.push('Selar portas e janelas com fita e plástico')
      result.actions.push('Desligar ventilação e ar condicionado')
      result.rulesApplied.push('SCENARIO_FALLOUT: shelter_in_place_critical')
    }

    if (scenarioType === 'pandemic') {
      result.actions.push('Isolar membros sintomáticos em cômodo separado')
      result.rulesApplied.push('SCENARIO_PANDEMIC: isolation_protocol')
    }

    // Battery/power rules
    if (inventory.battery < 20) {
      result.risks.push('Energia de reserva crítica — risco de perda de comunicação')
      result.actions.push('Conservar bateria: desligar dispositivos não essenciais')
      result.rulesApplied.push('BATTERY_LOW: battery < 20%')
    }

    // No medical kit
    if (!inventory.medical_kit) {
      result.risks.push('Kit médico ausente')
      result.actions.push('Identificar suprimentos médicos alternativos disponíveis')
      result.rulesApplied.push('NO_MEDICAL_KIT')
    }

    // Default low priority if nothing triggered
    if (result.rulesApplied.length === 0) {
      result.actions.push('Monitorar situação e manter comunicação')
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

  const familySummary = family
    .map((m) => {
      const flags = [
        m.age < 18 ? 'child' : m.age > 65 ? 'elder' : 'adult',
        m.medical_conditions ? `medical: ${m.medical_conditions}` : null,
        m.mobility && m.mobility !== 'full' ? `mobility: ${m.mobility}` : null,
      ]
        .filter(Boolean)
        .join(', ')
      return `- ${m.name} (${m.age} years, ${flags})`
    })
    .join('\n')

  const knowledgeContext = knowledgeChunks.length
    ? knowledgeChunks.join('\n')
    : 'No additional knowledge chunks available.'

  const criticalWarning =
    rulesResult.priority === 'CRITICAL'
      ? '\n⚠️ CRITICAL PRIORITY — Rules Engine detected life-threatening conditions. Your plan must address these FIRST.\n'
      : ''

  return `You are EOS — Emergency Operating System. You generate structured, prescriptive survival action plans.

RULES (deterministic — cannot be overridden):
Priority: ${rulesResult.priority}
Active rules: ${rulesResult.rulesApplied.join(', ')}
Identified risks: ${rulesResult.risks.join('; ')}
${criticalWarning}
FAMILY PROFILE:
Name: ${profile.name}
Location: ${profile.location}
Members:
${familySummary}

CURRENT INVENTORY:
Water: ${inventory.water_liters}L | Food: ${inventory.food_days} days | Fuel: ${inventory.fuel}L | Battery: ${inventory.battery}% | Medical kit: ${inventory.medical_kit ? 'Yes' : 'No'}

SCENARIO: ${scenario}
TYPE: ${scenarioType}

KNOWLEDGE BASE:
${knowledgeContext}

OUTPUT FORMAT — respond ONLY in this exact structure, no markdown:

PRIORITY: [CRITICAL|HIGH|MEDIUM|LOW]

RISKS:
- [risk 1]
- [risk 2]

IMMEDIATE (15 min):
- [action 1]
- [action 2]
- [action 3]

SHORT TERM (1 hour):
- [action 1]
- [action 2]

MID TERM (3 hours):
- [action 1]
- [action 2]

Rules: never give vague advice. Every action must be specific and executable. Quantities where relevant. Prioritize the most vulnerable family members first.`
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
    const priority = (
      priorityMatch?.[1] ?? rulesResult.priority
    ) as IntelligenceResponse['priority']

    // Rules Engine priority cannot be downgraded
    const finalPriority = escalate(priority, rulesResult.priority)

    return {
      mode,
      priority: finalPriority,
      risks: extractList('RISKS').length
        ? extractList('RISKS')
        : rulesResult.risks,
      immediate_actions: extractList('IMMEDIATE'),
      short_term_actions: extractList('SHORT TERM'),
      mid_term_actions: extractList('MID TERM'),
      rulesApplied: rulesResult.rulesApplied,
      knowledgeSources: [],
    }
  } catch {
    // Parse error fallback
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

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Authenticate
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const token = authHeader.slice(7)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token)

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
        },
      )
    }
  }

  // 2. Validate body
  let body: AnalyzeRequest
  try {
    body = await request.json()
    if (!body.scenario || typeof body.scenario !== 'string') {
      throw new Error('scenario required')
    }
    if (!body.scenarioType || typeof body.scenarioType !== 'string') {
      throw new Error('scenarioType required')
    }
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'Bad Request',
        detail: e instanceof Error ? e.message : 'Invalid body',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // 3. Fetch profile + family + inventory
  const [profileRes, familyRes, inventoryRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', user.id).single(),
    supabase.from('family_members').select('*').eq('user_id', user.id),
    supabase
      .from('resource_inventory')
      .select('*')
      .eq('user_id', user.id)
      .single(),
  ])

  const profile: Profile = profileRes.data ?? {
    id: user.id,
    name: 'Unknown',
    location: 'Unknown',
  }

  const family: FamilyMember[] = familyRes.data ?? []

  const inventory: ResourceInventory = inventoryRes.data ?? {
    water_liters: 0,
    food_days: 0,
    fuel: 0,
    battery: 0,
    medical_kit: false,
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
  const knowledgeChunks = await getRelevantChunks(
    body.scenario,
    body.scenarioType
  )

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
        const survivalResponse = buildSurvivalResponse(rulesResult)
        send({ done: true, response: survivalResponse })
        controller.close()
      }, TIMEOUT_MS)

      const tryCallLLM = async (attempt: number): Promise<boolean> => {
        try {
          const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
          })

          const stream = await anthropic.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: `Emergency scenario: ${body.scenario}\nType: ${body.scenarioType}\n\nGenerate the action plan now.`,
              },
            ],
          })

          for await (const event of stream) {
            if (timedOut) return false

            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              const token = event.delta.text
              fullText += token
              send({ token })
            }
          }

          return true
        } catch (err: unknown) {
          const status =
            err instanceof Error && 'status' in err
              ? (err as { status: number }).status
              : 0

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
        finalResponse.knowledgeSources =
          knowledgeChunks.length > 0
            ? ['Knowledge Base (pgvector RAG)']
            : ['Rules Engine (offline)']

        // 8. Save action plan (non-blocking, failure doesn't propagate)
        try {
          const { data: plan } = await supabase
            .from('action_plans')
            .insert({
              user_id: user.id,
              priority: finalResponse.priority,
              risks: finalResponse.risks,
              plan_15min: finalResponse.immediate_actions,
              plan_1h: finalResponse.short_term_actions,
              plan_3h: finalResponse.mid_term_actions,
              rules_applied: finalResponse.rulesApplied,
              mode: finalResponse.mode,
              scenario_description: body.scenario,
              scenario_type: body.scenarioType,
            })
            .select('id')
            .single()

          if (plan?.id) {
            finalResponse.action_plan_id = plan.id
          }
        } catch {
          // Log only — do not fail the response
          console.error('[EOS] Failed to persist action_plan')
        }
      } else {
        finalResponse = buildSurvivalResponse(rulesResult)
      }

      // 9. Send final response
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
