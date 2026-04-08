import { getOpenAIClient, getOpenAIModel } from '@/lib/openai'
import { RulesEngine } from '@/lib/rules-engine'
import { UrgencyLevel, type RulesQuery, type ScenarioType } from '@/lib/types'

type FamilyMember = {
  name: string
  age: number | null
  medical_conditions: string[] | null
  mobility_impaired: boolean | null
  is_infant: boolean | null
}

type InventoryRow = {
  water_liters: number | null
  food_days: number | null
  fuel_liters: number | null
  battery_percent: number | null
  has_medical_kit: boolean | null
  has_communication_device: boolean | null
  cash_amount: number | null
}

type GeneratedPlan = {
  risks: string[]
  immediate_actions: string[]
  short_term_actions: string[]
  mid_term_actions: string[]
}

type GenerateActionPlanInput = {
  scenarioType: ScenarioType
  description?: string | null
  severity?: number
}

type GenerateActionPlanResult = {
  scenario: { id: string; type: ScenarioType }
  actionPlan: {
    id: string
    priority: number
    rules_applied: string[]
    immediate_actions: string[]
  }
  rulesResult: {
    urgency: UrgencyLevel
    rulesApplied: string[]
  }
}

type FamilyQuery = {
  select: (...args: unknown[]) => FamilyQuery
  eq: (...args: unknown[]) => FamilyQuery
  order: (...args: unknown[]) => Promise<{ data: FamilyMember[] | null; error: { message: string } | null }>
}

type InventoryQuery = {
  select: (...args: unknown[]) => InventoryQuery
  eq: (...args: unknown[]) => InventoryQuery
  maybeSingle: () => Promise<{ data: InventoryRow | null; error: { message: string } | null }>
}

type ScenarioInsertQuery = {
  insert: (...args: unknown[]) => ScenarioInsertQuery
  select: (...args: unknown[]) => ScenarioInsertQuery
  single: () => Promise<{ data: { id: string; type: ScenarioType } | null; error: { message: string } | null }>
}

type ActionPlanInsertQuery = {
  insert: (...args: unknown[]) => ActionPlanInsertQuery
  select: (...args: unknown[]) => ActionPlanInsertQuery
  single: () => Promise<{
    data: { id: string; priority: number; rules_applied: string[]; immediate_actions: string[] } | null
    error: { message: string } | null
  }>
}

type SupabaseLike = {
  from: (table: string) => unknown
}

const PRIORITY_BY_URGENCY: Record<UrgencyLevel, number> = {
  [UrgencyLevel.LOW]: 1,
  [UrgencyLevel.MEDIUM]: 2,
  [UrgencyLevel.HIGH]: 3,
  [UrgencyLevel.CRITICAL]: 4,
}

function normalizeInventory(row: InventoryRow | null) {
  return {
    water_liters: Number(row?.water_liters) || 0,
    food_days: Number(row?.food_days) || 0,
    fuel_liters: Number(row?.fuel_liters) || 0,
    battery_percent: Number(row?.battery_percent) || 0,
    has_medical_kit: Boolean(row?.has_medical_kit),
    has_communication_device: Boolean(row?.has_communication_device),
    cash_amount: Number(row?.cash_amount) || 0,
  }
}

function buildRulesQuery(family: FamilyMember[], inventoryRow: InventoryRow | null, scenarioType: ScenarioType): RulesQuery {
  const inventory = normalizeInventory(inventoryRow)

  return {
    people_count: Math.max(family.length, 1),
    water_liters: inventory.water_liters,
    food_days: inventory.food_days,
    has_infants: family.some((member) => Boolean(member.is_infant)),
    has_medical_conditions: family.some((member) => (member.medical_conditions?.length ?? 0) > 0),
    mobility_impaired: family.filter((member) => Boolean(member.mobility_impaired)).length,
    scenarioType,
    has_communication_device: inventory.has_communication_device,
  }
}

function extractPlanJson(raw: string): GeneratedPlan {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error('No JSON object found in plan response.')
  }

  const parsed = JSON.parse(match[0]) as Partial<GeneratedPlan>

  return {
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(String).filter(Boolean).slice(0, 5) : [],
    immediate_actions: Array.isArray(parsed.immediate_actions)
      ? parsed.immediate_actions.map(String).filter(Boolean).slice(0, 5)
      : [],
    short_term_actions: Array.isArray(parsed.short_term_actions)
      ? parsed.short_term_actions.map(String).filter(Boolean).slice(0, 5)
      : [],
    mid_term_actions: Array.isArray(parsed.mid_term_actions)
      ? parsed.mid_term_actions.map(String).filter(Boolean).slice(0, 5)
      : [],
  }
}

async function generatePlanWithOpenAI({
  family,
  inventory,
  scenarioType,
  rulesApplied,
  urgency,
}: {
  family: FamilyMember[]
  inventory: ReturnType<typeof normalizeInventory>
  scenarioType: ScenarioType
  rulesApplied: string[]
  urgency: UrgencyLevel
}) {
  const client = getOpenAIClient()
  const model = getOpenAIModel()

  const prompt = `
Você é um planejador operacional de emergência para famílias.
Responda apenas com JSON válido.

Formato:
{
  "risks": ["até 5 itens"],
  "immediate_actions": ["até 5 itens"],
  "short_term_actions": ["até 5 itens"],
  "mid_term_actions": ["até 5 itens"]
}

Contexto:
- Cenário: ${scenarioType}
- Urgência calculada: ${urgency}
- Regras aplicadas: ${JSON.stringify(rulesApplied)}
- Família: ${JSON.stringify(family)}
- Inventário: ${JSON.stringify(inventory)}

Regras:
- Português do Brasil.
- Seja objetivo e acionável.
- Em FALLOUT, priorize abrigo no local, selagem do ambiente, água, comunicação e proteção do bebê se houver infant.
- Não invente recursos inexistentes.
`

  const response = await client.responses.create({
    model,
    input: prompt,
  })

  return extractPlanJson(response.output_text)
}

export async function generateAndSaveActionPlan(
  supabase: SupabaseLike,
  userId: string,
  input: GenerateActionPlanInput,
): Promise<GenerateActionPlanResult> {
  const [{ data: family, error: familyError }, { data: inventoryRow, error: inventoryError }] = await Promise.all([
    (supabase.from('family_members') as FamilyQuery)
      .select('name, age, medical_conditions, mobility_impaired, is_infant')
      .eq('profile_id', userId)
      .order('created_at', { ascending: true }),
    (supabase.from('resource_inventory') as InventoryQuery)
      .select(
        'water_liters, food_days, fuel_liters, battery_percent, has_medical_kit, has_communication_device, cash_amount',
      )
      .eq('profile_id', userId)
      .maybeSingle(),
  ])

  if (familyError) throw new Error(familyError.message)
  if (inventoryError) throw new Error(inventoryError.message)

  const members = (family ?? []) as FamilyMember[]
  const inventory = normalizeInventory((inventoryRow ?? null) as InventoryRow | null)
  const rulesQuery = buildRulesQuery(members, (inventoryRow ?? null) as InventoryRow | null, input.scenarioType)
  const rulesResult = RulesEngine.evaluate(rulesQuery)
  const generatedPlan = await generatePlanWithOpenAI({
    family: members,
    inventory,
    scenarioType: input.scenarioType,
    rulesApplied: rulesResult.rulesApplied,
    urgency: rulesResult.urgency,
  })

  const { data: scenario, error: scenarioError } = await (supabase.from('scenarios') as ScenarioInsertQuery)
    .insert({
      profile_id: userId,
      type: input.scenarioType,
      description: input.description ?? null,
      severity: input.severity ?? PRIORITY_BY_URGENCY[rulesResult.urgency],
    })
    .select('id, type')
    .single()

  if (scenarioError) throw new Error(scenarioError.message)
  if (!scenario) throw new Error('Scenario was not created.')

  const { data: actionPlan, error: actionPlanError } = await (supabase.from('action_plans') as ActionPlanInsertQuery)
    .insert({
      scenario_id: scenario.id,
      mode: 'CONNECTED',
      priority: PRIORITY_BY_URGENCY[rulesResult.urgency],
      risks: generatedPlan.risks,
      immediate_actions: generatedPlan.immediate_actions,
      short_term_actions: generatedPlan.short_term_actions,
      mid_term_actions: generatedPlan.mid_term_actions,
      rules_applied: rulesResult.rulesApplied,
    })
    .select('id, priority, rules_applied, immediate_actions')
    .single()

  if (actionPlanError) throw new Error(actionPlanError.message)
  if (!actionPlan) throw new Error('Action plan was not created.')

  return {
    scenario,
    actionPlan,
    rulesResult,
  }
}
