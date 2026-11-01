jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => null }))
jest.mock('@/lib/error-log', () => ({ logError: jest.fn() }))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Household, HouseholdPerson } from '../household'
import {
  healthOwnerOf,
  householdForAi,
  loadAiHealthConsent,
  redactPersonForAi,
  redactProfileHealthForAi,
} from '../ai-health-consent'
import { buildPilotCircleRecord, buildPilotFamilyRecord } from '../pilot-family-record'
import { logError } from '@/lib/error-log'

const person = (over: Partial<HouseholdPerson>): HouseholdPerson => ({
  userId: null,
  name: 'X',
  isMe: false,
  age: 40,
  medicalConditions: ['diabetes tipo 1'],
  medications: ['insulina'],
  mobilityImpaired: true,
  isInfant: false,
  dependsOn: null,
  relationship: null,
  careNotes: 'geladeira para a insulina',
  medicalVisible: true,
  awaitingConfirmation: false,
  ...over,
})

const household = (people: HouseholdPerson[]): Household => ({
  people,
  size: people.length,
  inventory: { waterLiters: 40, foodPersonDays: 12, fuelLiters: 0, batteryPercent: 80, hasMedicalKit: true, hasCommunicationDevice: false, contributors: 1 },
  reachable: [],
  needsHidden: people.filter(p => !p.medicalVisible).length,
  pendingNames: [],
  duplicates: [],
  known: true,
})

/** Cliente falso: devolve `result` para `from('profiles').select().in()`. */
const fakeClient = (result: { data: unknown; error: unknown }) => {
  const calls: { select?: string; ids?: string[] } = {}
  const client = {
    from: () => ({
      select: (cols: string) => {
        calls.select = cols
        return { in: (_col: string, ids: string[]) => { calls.ids = ids; return Promise.resolve(result) } }
      },
    }),
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('quem responde pela ficha (D-231)', () => {
  it('a conta responde por si; o dependente segue quem cuida dele', () => {
    expect(healthOwnerOf({ userId: 'a', dependsOn: null })).toBe('a')
    expect(healthOwnerOf({ userId: null, dependsOn: 'b' })).toBe('b')
    expect(healthOwnerOf({ userId: null, dependsOn: null })).toBeNull()
  })
})

describe('redação para a IA', () => {
  it('desligado por padrão: sem consentimento, nada de saúde sai', () => {
    const r = redactPersonForAi(person({ userId: 'a' }), new Set())
    expect(r.medicalConditions).toEqual([])
    expect(r.medications).toEqual([])
    expect(r.mobilityImpaired).toBe(false)
    expect(r.careNotes).toBeNull()
    expect(r.medicalVisible).toBe(false)
    // O que não é saúde fica: idade e nome mudam a conta de água.
    expect(r.age).toBe(40)
    expect(r.name).toBe('X')
  })

  it('com consentimento do dono, a pessoa passa intacta', () => {
    const p = person({ userId: 'a' })
    expect(redactPersonForAi(p, new Set(['a']))).toBe(p)
  })

  it('o consentimento de quem PERGUNTA não libera a ficha de outra conta', () => {
    const outra = person({ userId: 'b' })
    expect(redactPersonForAi(outra, new Set(['a'])).medications).toEqual([])
  })

  it('dependente segue o consentimento do cuidador', () => {
    const filho = person({ dependsOn: 'a' })
    expect(redactPersonForAi(filho, new Set(['a'])).medications).toEqual(['insulina'])
    expect(redactPersonForAi(filho, new Set(['b'])).medications).toEqual([])
  })

  it('needsHidden passa a contar quem não autorizou — inclusive quem não tem nada', () => {
    // Marcar como oculto só quem TEM algo já revelaria que tem.
    const casa = household([
      person({ userId: 'a', isMe: true }),
      person({ userId: 'b', medicalConditions: [], medications: [], mobilityImpaired: false, careNotes: null }),
      person({ dependsOn: 'a' }),
    ])
    const ia = householdForAi(casa, new Set(['a']))
    expect(ia.needsHidden).toBe(1)
    expect(ia.size).toBe(3)
    expect(ia.inventory).toBe(casa.inventory)
    expect(householdForAi(casa, new Set()).needsHidden).toBe(3)
  })

  it('a ficha da conta perde só os campos de saúde', () => {
    const ficha = { name: 'Paulo', location: 'Parkland', blood_type: 'O+', allergies: ['penicilina'], medications: ['insulina'], medical_notes: 'DM1' }
    const fora = redactProfileHealthForAi(ficha, 'a', new Set())
    expect(fora.withheld).toBe(true)
    expect(fora.profile).toEqual({ name: 'Paulo', location: 'Parkland', blood_type: null, allergies: null, medications: null, medical_notes: null })
    expect(redactProfileHealthForAi(ficha, 'a', new Set(['a']))).toEqual({ profile: ficha, withheld: false })
  })
})

describe('o prompt diz "não autorizado", nunca "não consta" (D-174)', () => {
  it('ficha própria e de dependente não autorizadas', () => {
    const record = buildPilotFamilyRecord({
      pt: true,
      profileHealthWithheld: true,
      profile: { name: 'Paulo', blood_type: null, allergies: null, medications: null, medical_notes: null },
      members: [{ name: 'Isadora', age: 8, medical_conditions: [], medications: [], health_withheld: true }],
    })
    expect(record).toContain('Ficha médica: não autorizada para a IA')
    expect(record).not.toContain('Tipo sanguíneo')
    expect(record).toContain('Isadora: idade 8; ficha médica não autorizada para a IA')
    expect(record).not.toMatch(/medicamentos não consta/)
  })

  it('círculo: compartilhado com a família, mas não autorizado para a IA', () => {
    const record = buildPilotCircleRecord({
      pt: false,
      members: [{
        circleName: 'Casa', name: 'Ana', medicalShared: true, medicalWithheld: true,
        contactShared: false, locationShared: false, blood_type: null,
      }],
    })
    expect(record).toContain('medical record: not authorised for AI')
    expect(record).not.toContain('blood type')
  })
})

describe('loadAiHealthConsent fecha na dúvida', () => {
  it('lê só a coluna de consentimento e devolve quem consentiu', async () => {
    const { client, calls } = fakeClient({
      data: [{ id: 'a', ai_health_consent_at: '2026-11-01T00:00:00Z' }, { id: 'b', ai_health_consent_at: null }],
      error: null,
    })
    const ok = await loadAiHealthConsent(['a', 'b', 'a', null], client)
    expect(Array.from(ok)).toEqual(['a'])
    expect(calls.select).toBe('id, ai_health_consent_at')
    expect(calls.ids).toEqual(['a', 'b'])
  })

  it('migração pendente (42703) → ninguém, sem poluir o error_log', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42703', message: 'column does not exist' } })
    expect((await loadAiHealthConsent(['a'], client)).size).toBe(0)
    expect(logError).not.toHaveBeenCalled()
  })

  it('erro de leitura → ninguém, e registra', async () => {
    const { client } = fakeClient({ data: null, error: { code: '500', message: 'boom' } })
    expect((await loadAiHealthConsent(['a'], client)).size).toBe(0)
    expect(logError).toHaveBeenCalledWith('ai-health-consent:load', expect.anything())
  })

  it('sem service-role → ninguém', async () => {
    expect((await loadAiHealthConsent(['a'])).size).toBe(0)
  })
})
