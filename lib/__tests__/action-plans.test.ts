import { generateAndSaveActionPlan } from '../action-plans'
import { ScenarioType, UrgencyLevel } from '../types'

jest.mock('../openai', () => ({
  getOpenAIClient: jest.fn(() => ({
    responses: {
      create: jest.fn(async () => ({
        output_text: JSON.stringify({
          risks: ['Exposição radioativa', 'Água limitada para bebê'],
          immediate_actions: ['Abrigar-se imediatamente', 'Separar água segura para o bebê'],
          short_term_actions: ['Selar portas e janelas', 'Monitorar comunicação oficial'],
          mid_term_actions: ['Racionar suprimentos', 'Preparar evacuação apenas se instruído'],
        }),
      })),
    },
  })),
  getOpenAIModel: jest.fn(() => 'gpt-5'),
}))

function createQueryBuilder(result: { data: unknown; error: { message: string } | null }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn(async () => result),
    maybeSingle: jest.fn(async () => result),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn(async () => result),
  }
}

describe('generateAndSaveActionPlan', () => {
  it('gera CRITICAL para FALLOUT + infant, persiste scenario e action_plan no Supabase', async () => {
    const familyRows = [
      {
        name: 'Bebe',
        age: 1,
        medical_conditions: [],
        mobility_impaired: false,
        is_infant: true,
      },
      {
        name: 'Responsavel',
        age: 32,
        medical_conditions: [],
        mobility_impaired: false,
        is_infant: false,
      },
    ]

    const inventoryRow = {
      water_liters: 20,
      food_days: 5,
      fuel_liters: 10,
      battery_percent: 80,
      has_medical_kit: true,
      has_communication_device: true,
      cash_amount: 500,
    }

    const scenariosInsert = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn(async () => ({
        data: { id: 'scenario-1', type: 'FALLOUT' },
        error: null,
      })),
    }

    const actionPlansInsert = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn(async () => ({
        data: {
          id: 'plan-1',
          priority: 4,
          rules_applied: ['PRIORIDADE: Nutrição do bebê', 'FALLOUT: abrigo no local obrigatório'],
          immediate_actions: ['Abrigar-se imediatamente', 'Separar água segura para o bebê'],
        },
        error: null,
      })),
    }

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'family_members') {
          return createQueryBuilder({ data: familyRows, error: null })
        }
        if (table === 'resource_inventory') {
          return createQueryBuilder({ data: inventoryRow, error: null })
        }
        if (table === 'scenarios') {
          return scenariosInsert
        }
        if (table === 'action_plans') {
          return actionPlansInsert
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    }

    const result = await generateAndSaveActionPlan(supabase, 'user-1', {
      scenarioType: ScenarioType.FALLOUT,
      description: 'Teste de fallout com bebê',
    })

    expect(result.rulesResult.urgency).toBe(UrgencyLevel.CRITICAL)
    expect(result.rulesResult.rulesApplied).toEqual(
      expect.arrayContaining(['PRIORIDADE: Nutrição do bebê', 'FALLOUT: abrigo no local obrigatório']),
    )

    expect(scenariosInsert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_id: 'user-1',
        type: 'FALLOUT',
      }),
    )

    expect(actionPlansInsert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        scenario_id: 'scenario-1',
        priority: 4,
        mode: 'CONNECTED',
        rules_applied: expect.arrayContaining(['PRIORIDADE: Nutrição do bebê', 'FALLOUT: abrigo no local obrigatório']),
        immediate_actions: expect.arrayContaining(['Abrigar-se imediatamente']),
      }),
    )
  })
})
