/** INVENTORY-001 / INV-T05 — o estoque como o Pilot lê (critério 12). */

import { PILOT_STOCK_LIMIT, pilotStockBlock, type PilotStockHouse } from '@/lib/pilot-stock'

const loc = (id: string, parentId: string | null, name: string, kind = 'CUSTOM', isDefault = false) =>
  ({ id, parentId, name, kind, isDefault }) as PilotStockHouse['locations'][number]
let n = 0
const item = (p: Partial<PilotStockHouse['items'][number]>) => ({
  id: `i${++n}`, profileId: 'paulo', locationId: 'casa', label: 'x', quantity: 1, unit: 'un', brand: null, model: null,
  expiresOn: null, resourceKey: 'lanterna', foodType: null, mealsOverride: null, ...p,
})
const house = (items: PilotStockHouse['items']): PilotStockHouse => ({
  me: 'paulo',
  names: new Map([['paulo', 'Paulo'], ['daniela', 'Daniela']]),
  homeRootIds: ['casa'],
  locations: [loc('casa', null, 'Casa', 'HOME', true), loc('garagem', 'casa', 'Garagem'), loc('mv', 'garagem', 'Mochila vermelha'), loc('carro', null, 'Carro', 'VEHICLE')],
  items,
})

describe('bloco do estoque para o Pilot', () => {
  it('critério 12: nome, marca, modelo, lugar, dono e validade', () => {
    const b = pilotStockBlock(house([
      item({ label: 'Rádio', brand: 'Midland', model: 'ER310', locationId: 'mv', profileId: 'daniela', expiresOn: '2027-06-01' }),
    ]), '2026-11-07', true)
    expect(b).toContain('- Rádio (Midland ER310): 1 un — Casa › Garagem › Mochila vermelha · de Daniela · validade 2027-06-01')
  })
  it('vencidos e a vencer aparecem em destaque e primeiro na lista', () => {
    const b = pilotStockBlock(house([
      item({ label: 'Lanterna' }),
      item({ label: 'Pilhas AA', expiresOn: '2026-11-20' }),
      item({ label: 'Arroz', resourceKey: 'comida', quantity: 5000, unit: 'g', foodType: 'arroz', expiresOn: '2026-10-01' }),
    ]), '2026-11-07', true)
    expect(b).toContain('Vencidos: Arroz.')
    expect(b).toContain('Vencem em até 30 dias: Pilhas AA.')
    const linhas = b.split('\n').filter(l => l.startsWith('- '))
    expect(linhas[0]).toContain('Arroz')
    expect(linhas[0]).toContain('5.0 kg, ≈27 refeições')
    expect(linhas[0]).toContain('VENCIDO em 2026-10-01')
    expect(linhas[1]).toContain('Pilhas AA')
  })
  it('item fora de casa é marcado', () => {
    expect(pilotStockBlock(house([item({ label: 'Kit', locationId: 'carro' })]), '2026-11-07', true)).toContain('Carro › (fora de casa)')
  })
  it('até 40 itens, dizendo quantos há', () => {
    const muitos = Array.from({ length: 45 }, (_, k) => item({ label: `Item ${String(k).padStart(2, '0')}` }))
    const b = pilotStockBlock(house(muitos), '2026-11-07', false)
    expect(b.split('\n').filter(l => l.startsWith('- '))).toHaveLength(PILOT_STOCK_LIMIT)
    expect(b).toContain('45 items, showing 40')
  })
  it('estoque vazio diz isso — o Pilot não pode presumir', () => {
    expect(pilotStockBlock(house([]), '2026-11-07', true)).toMatch(/nenhum item registrado/)
    expect(pilotStockBlock(house([item({ quantity: 0 })]), '2026-11-07', true)).toMatch(/nenhum item registrado/)
  })
})
