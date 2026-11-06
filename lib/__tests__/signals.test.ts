/**
 * SIGNAL-001 Marco 1 — contas do protocolo e validação do conteúdo.
 *
 * Dois testes carregam a regra mais cara do spec:
 * - todo Sinal versionado tem "o que não é" e fonte (§5, regras 3 e 4);
 * - os dias de água e comida do protocolo são os MESMOS de `householdDays()`,
 *   a função do painel e do Pilot (critério 4, D-174).
 */
import { householdDays } from '@/lib/household-days'
import { WATER_LITERS_PER_PERSON_DAY } from '@/lib/units'
import { SIGNALS, publishedSignals, signalBySlug } from '@/lib/signals-content'
import {
  DEGREE_DAYS,
  itemsForDegree,
  nextDegree,
  protocolView,
  signalProblems,
  type HouseInput,
  type Signal,
} from '@/lib/signals'

const fortress = signalBySlug('fortress') as Signal

const house = (over: Partial<HouseInput> = {}): HouseInput => ({
  size: 4,
  known: true,
  waterLiters: 0,
  foodPersonDays: 0,
  hasMedicalKit: false,
  hasCommunicationDevice: false,
  ...over,
})

describe('conteúdo versionado', () => {
  it.each(SIGNALS.map(s => [s.slug, s] as const))('%s pode ir ao ar', (_slug, s) => {
    expect(signalProblems(s)).toEqual([])
  })

  it('FORTRESS está publicado e marcado como sem revisão da curadoria (D-233)', () => {
    expect(publishedSignals().map(s => s.slug)).toContain('fortress')
    expect(fortress.reviewedByCurator).toBe(false)
    expect(fortress.protocol.recommendedDegree).toBe('D14')
  })
})

describe('validação recusa o que não pode publicar', () => {
  const base = fortress
  it('sem "o que não é"', () => {
    expect(signalProblems({ ...base, whatItIsNot: { pt: '', en: 'x' } })).toContain('"o que não é" vazio')
  })
  it('sem fonte', () => {
    expect(signalProblems({ ...base, sources: [] })).toContain('sem fonte')
  })
  it('fonte sem https', () => {
    expect(signalProblems({ ...base, sources: [{ title: 'x', url: 'http://x.com' }] })[0]).toMatch(/fonte inválida/)
  })
  it('AGIR sem alerta oficial', () => {
    expect(signalProblems({ ...base, level: 'AGIR', officialAlert: false })).toContain('AGIR sem alerta oficial')
  })
})

describe('uma conta só (critério 4)', () => {
  it('dias de água e comida iguais aos do painel e do Pilot', () => {
    const h = house({ waterLiters: 120, foodPersonDays: 22 })
    const v = protocolView(fortress.protocol, 'D14', h, new Set())
    const painel = householdDays({ waterLiters: 120, foodPersonDays: 22, fuelLiters: 0, batteryPercent: 0 }, 4, true)
    expect(v.householdDays.water).toBeCloseTo(painel.water as number, 9)
    expect(v.householdDays.food).toBeCloseTo(painel.food as number, 9)
    expect(v.householdDays.autonomy).toBeCloseTo(painel.autonomy as number, 9)
  })

  it('água usa a constante do motor, sem régua própria (critério 5)', () => {
    const v = protocolView(fortress.protocol, 'D14', house(), new Set())
    const agua = v.items.find(i => i.item.resourceKey === 'agua')!
    expect(agua.need).toBeCloseTo(WATER_LITERS_PER_PERSON_DAY * 4 * 14, 9)
    expect(agua.unit).toBe('L')
  })

  it('comida em dia-pessoa (D-158)', () => {
    const v = protocolView(fortress.protocol, 'D3', house({ foodPersonDays: 6 }), new Set())
    const comida = v.items.find(i => i.item.resourceKey === 'comida')!
    expect(comida.need).toBe(12)
    expect(comida.unit).toBe('dia-pessoa')
    expect(comida.status).toBe('partial')
  })
})

describe('degraus', () => {
  it('degrau maior inclui mais itens', () => {
    const n = fortress.protocol.degrees.map(d => itemsForDegree(fortress.protocol, d).length)
    expect(n).toEqual([...n].sort((a, b) => a - b))
    expect(n[0]).toBeLessThan(n[n.length - 1])
  })

  it('próximo degrau é o primeiro acima da autonomia', () => {
    expect(nextDegree(fortress.protocol, 2.2)).toBe('D3')
    expect(nextDegree(fortress.protocol, 6)).toBe('D14')
    expect(nextDegree(fortress.protocol, 200)).toBe('D90')
    expect(nextDegree(fortress.protocol, null)).toBe('D14')
    expect(DEGREE_DAYS.D90).toBe(90)
  })
})

describe('cobertura sem gravar nada', () => {
  it('E1 — casa sem gente contada: água e comida unknown, prontidão null', () => {
    const v = protocolView(fortress.protocol, 'D14', house({ size: 0 }), new Set())
    expect(v.items.find(i => i.item.resourceKey === 'agua')!.status).toBe('unknown')
    expect(v.ready).toBeNull()
  })

  it('E1 — casa desconhecida não vira casa de uma pessoa', () => {
    const v = protocolView(fortress.protocol, 'D14', house({ known: false, size: 1 }), new Set())
    expect(v.ready).toBeNull()
    expect(v.householdDays.autonomy).toBeNull()
  })

  it('E2 — casa sem nada: 0%, sem divisão por zero', () => {
    const v = protocolView(fortress.protocol, 'D3', house(), new Set())
    expect(v.ready).toBe(0)
    expect(v.items.every(i => i.status === 'missing')).toBe(true)
  })

  it('durável coberto pelo inventário legado ou por requisito met', () => {
    const v = protocolView(fortress.protocol, 'D3', house({ hasMedicalKit: true }), new Set(['lanterna']))
    const kit = v.items.find(i => i.item.resourceKey === 'kit-medico')!
    const lanterna = v.items.find(i => i.item.resourceKey === 'lanterna')!
    expect([kit.status, kit.coveredBy]).toEqual(['covered', 'inventory'])
    expect([lanterna.status, lanterna.coveredBy]).toEqual(['covered', 'requirement'])
  })

  it('E7 — descartado sai da conta', () => {
    const all = itemsForDegree(fortress.protocol, 'D3').map(i => i.resourceKey).filter(k => k !== 'agua' && k !== 'comida')
    const v = protocolView(fortress.protocol, 'D3', house({ waterLiters: 999, foodPersonDays: 999 }), new Set(), new Set(all))
    expect(v.ready).toBe(1)
  })

  it('casa completa no degrau dá 100%', () => {
    const keys = new Set(fortress.protocol.items.map(i => i.resourceKey))
    const v = protocolView(fortress.protocol, 'D90', house({ waterLiters: 99999, foodPersonDays: 9999 }), keys)
    expect(v.ready).toBe(1)
    expect(v.limiting).not.toBeNull()
  })
})
