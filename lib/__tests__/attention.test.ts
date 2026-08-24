/**
 * "Precisa de atenção" (PREP-T07 fase 2).
 *
 * O teste que mais importa é o da casa desconhecida: o resto do app usa
 * `max(size, 1)` para não dividir por zero, e isso é defesa correta virando
 * resposta errada — uma casa de quatro avaliada como se fosse uma parece quatro
 * vezes mais preparada do que é.
 */
import { attentionItems, type AttentionInput } from '@/lib/attention'
import { gallonsToLiters } from '@/lib/units'

const casa = (over: Partial<AttentionInput> = {}): AttentionInput => ({
  // 4 dias por pessoa para 2 pessoas: acima do piso da FEMA.
  waterLiters: gallonsToLiters(4 * 2),
  foodDays: 7,
  batteryPercent: 100,
  hasMedicalKit: true,
  hasCommunicationDevice: true,
  householdSize: 2,
  essentialDone: 5,
  essentialTotal: 5,
  ...over,
})

const kinds = (i: AttentionInput) => attentionItems(i).map(a => a.kind)
const acha = (i: AttentionInput, kind: string) => attentionItems(i).find(a => a.kind === kind)

describe('casa preparada', () => {
  it('não produz nenhum item', () => {
    expect(attentionItems(casa())).toEqual([])
  })
})

describe('água — régua da FEMA', () => {
  it('abaixo de 3 dias por pessoa é baixo', () => {
    expect(acha(casa({ waterLiters: gallonsToLiters(2 * 2) }), 'water')?.severity).toBe('low')
  })

  it('abaixo de 1 dia por pessoa é crítico', () => {
    expect(acha(casa({ waterLiters: gallonsToLiters(0.5 * 2) }), 'water')?.severity).toBe('critical')
  })

  it('exatamente no piso não é falta', () => {
    expect(kinds(casa({ waterLiters: gallonsToLiters(3 * 2) }))).not.toContain('water')
  })

  it('conta os dias para a frase da tela', () => {
    const item = acha(casa({ waterLiters: gallonsToLiters(2 * 2) }), 'water')
    expect(item?.detail.days).toBeCloseTo(2, 6)
  })
})

describe('comida', () => {
  it('menos de um dia é crítico', () => {
    expect(acha(casa({ foodDays: 0.5 }), 'food')?.severity).toBe('critical')
  })
  it('menos de três dias é baixo', () => {
    expect(acha(casa({ foodDays: 2 }), 'food')?.severity).toBe('low')
  })
  it('três dias já basta', () => {
    expect(kinds(casa({ foodDays: 3 }))).not.toContain('food')
  })
})

describe('bateria é capacidade, não sobrevivência', () => {
  it('abaixo de 30% é baixo', () => {
    expect(acha(casa({ batteryPercent: 20 }), 'battery')?.severity).toBe('low')
  })
  it('abaixo de 10% é crítico', () => {
    expect(acha(casa({ batteryPercent: 5 }), 'battery')?.severity).toBe('critical')
  })
  it('cheia não aparece', () => {
    expect(kinds(casa({ batteryPercent: 100 }))).not.toContain('battery')
  })
})

describe('equipamentos', () => {
  it('sem kit médico e sem rádio, dois itens', () => {
    const saida = kinds(casa({ hasMedicalKit: false, hasCommunicationDevice: false }))
    expect(saida).toContain('medical-kit')
    expect(saida).toContain('comms')
  })
})

describe('checklist essencial', () => {
  it('incompleto vira item com a contagem', () => {
    const item = acha(casa({ essentialDone: 2, essentialTotal: 7 }), 'checklist-essential')
    expect(item?.detail).toMatchObject({ done: 2, total: 7 })
  })

  it('lista VAZIA não vira alarme', () => {
    // "Nada foi olhado" não é "está tudo faltando". A Visão convida a gerar a
    // lista pela porta; alarmar sobre ausência de informação seria ruído.
    expect(kinds(casa({ essentialDone: 0, essentialTotal: 0 }))).not.toContain('checklist-essential')
  })

  it('completo não aparece', () => {
    expect(kinds(casa({ essentialDone: 5, essentialTotal: 5 }))).not.toContain('checklist-essential')
  })
})

describe('casa desconhecida — o item que impede a conta silenciosa', () => {
  it('vira item próprio', () => {
    expect(kinds(casa({ householdSize: 0 }))).toContain('household-unknown')
  })

  it('a água não afirma "crítico" sobre uma casa que não conhecemos', () => {
    /*
     * Com tamanho desconhecido o app divide por 1 para não estourar. Isso não
     * autoriza o veredito: a severidade cai para `unknown`, que por docs/37 §24
     * nunca lê como pronta nem como catástrofe medida.
     */
    const item = acha(casa({ householdSize: 0, waterLiters: 0 }), 'water')
    expect(item?.severity).toBe('unknown')
  })

  it('casa conhecida com a MESMA água afirma crítico', () => {
    expect(acha(casa({ householdSize: 2, waterLiters: 0 }), 'water')?.severity).toBe('critical')
  })
})

describe('ordem', () => {
  it('pior primeiro, e desconhecido acima de baixo', () => {
    const saida = attentionItems(casa({
      householdSize: 0,
      foodDays: 0.5,
      hasMedicalKit: false,
    }))
    expect(saida[0].severity).toBe('critical')
    expect(saida.map(i => i.severity)).toEqual([...saida.map(i => i.severity)].sort(
      (a, b) => ({ critical: 0, unknown: 1, low: 2 })[a] - ({ critical: 0, unknown: 1, low: 2 })[b],
    ))
  })

  it('cada item sabe onde se conserta', () => {
    for (const item of attentionItems(casa({ householdSize: 0, waterLiters: 0, essentialDone: 0, essentialTotal: 3 }))) {
      expect(['holdings', 'requirements', 'household']).toContain(item.where)
    }
  })
})
