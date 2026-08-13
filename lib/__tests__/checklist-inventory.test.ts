/**
 * Marcar item do checklist não mexe no estoque da casa (D-156 / PREP-T11).
 *
 * Este arquivo existe para que a decisão sobreviva a quem não leu a decisão.
 * Se alguém reintroduzir a sincronização automática — mesmo com um `Math.max`
 * "seguro" por cima, como havia antes — estes testes quebram.
 */
import {
  checklistToggleWritesInventory,
  inventoryAfterChecklistToggle,
  type ChecklistToggle,
  type InventoryScalars,
} from '@/lib/checklist-inventory'
import { gallonsToLiters, litersToGallons } from '@/lib/units'

const casa = (over: Partial<InventoryScalars> = {}): InventoryScalars => ({
  water_liters: 0,
  food_days: 0,
  fuel_liters: 0,
  battery_percent: 0,
  has_medical_kit: false,
  has_communication_device: false,
  cash_amount: 0,
  ...over,
})

const item = (over: Partial<ChecklistToggle> = {}): ChecklistToggle => ({
  canonical_key: 'agua',
  quantity: 4,
  unit: 'gal',
  kit_type: 'GERAL',
  acquired: true,
  ...over,
})

describe('checklist × inventário (D-156)', () => {
  it('marcar um item de 4 galões numa casa com 20 mantém os 20', () => {
    const antes = casa({ water_liters: gallonsToLiters(20) })
    const depois = inventoryAfterChecklistToggle(antes, item({ quantity: 4 }))

    expect(litersToGallons(depois.water_liters)).toBeCloseTo(20, 6)
  })

  it('marcar um item MAIOR que o estoque também não mexe no estoque', () => {
    /*
     * Este é o caso que o `Math.max` da versão antiga deixava passar: um item
     * "Água 20 gal" marcado como adquirido subia o estoque da casa para 20,
     * mesmo que a família tivesse 3. Quantidade planejada não é quantidade
     * medida — o checklist diz o que é PRECISO, não o que EXISTE.
     */
    const antes = casa({ water_liters: gallonsToLiters(3) })
    const depois = inventoryAfterChecklistToggle(antes, item({ quantity: 20 }))

    expect(litersToGallons(depois.water_liters)).toBeCloseTo(3, 6)
  })

  it('água de mochila não vira água de casa', () => {
    /*
     * D-156: a autonomia da casa lê o que está EM CASA. Um garrafão listado na
     * Bug Out não é estoque doméstico só porque foi marcado.
     */
    const antes = casa({ water_liters: gallonsToLiters(3) })
    const depois = inventoryAfterChecklistToggle(antes, item({ quantity: 5, kit_type: 'BUG_OUT' }))

    expect(litersToGallons(depois.water_liters)).toBeCloseTo(3, 6)
  })

  it('nenhum escalar do estoque muda, para nenhum tipo de item', () => {
    const antes = casa({
      water_liters: 50,
      food_days: 7,
      fuel_liters: 20,
      battery_percent: 80,
      cash_amount: 300,
    })

    const itens: ChecklistToggle[] = [
      item({ canonical_key: 'agua', quantity: 99 }),
      item({ canonical_key: 'combustivel', quantity: 99, unit: 'L' }),
      item({ canonical_key: 'comida', quantity: 99, unit: 'dias' }),
      item({ canonical_key: 'kit-primeiros-socorros', quantity: 1, unit: null }),
      item({ canonical_key: 'radio-comunicacao', quantity: 1, unit: null }),
      item({ canonical_key: 'dinheiro-especie', quantity: 9999 }),
    ]

    for (const each of itens) {
      expect(inventoryAfterChecklistToggle(antes, each)).toEqual(antes)
    }
  })

  it('desmarcar também não mexe em nada', () => {
    const antes = casa({ water_liters: 50, has_medical_kit: true })
    expect(inventoryAfterChecklistToggle(antes, item({ acquired: false }))).toEqual(antes)
  })

  it('kit médico e rádio não são ligados por marcar um item', () => {
    /*
     * A versão antiga fazia `has_medical_kit = true` ao marcar qualquer item
     * cujo nome casasse com a regex. Ter o item na lista de compras não é a
     * mesma coisa que ter o kit em casa.
     */
    const antes = casa()
    const comKit = inventoryAfterChecklistToggle(antes, item({ canonical_key: 'kit-medico' }))
    const comRadio = inventoryAfterChecklistToggle(antes, item({ canonical_key: 'radio' }))

    expect(comKit.has_medical_kit).toBe(false)
    expect(comRadio.has_communication_device).toBe(false)
  })

  it('nenhum item autoriza gravação de estoque enquanto Holding não existir', () => {
    const kits = ['GERAL', 'BUG_OUT', 'PESCA', 'CACA', 'ACAMPAMENTO', 'EDU_CONTENT', 'PILOT_RECOMMENDATION', 'SIMULATION_DEBRIEF']
    for (const kit_type of kits) {
      expect(checklistToggleWritesInventory(item({ kit_type }))).toBe(false)
    }
  })
})
