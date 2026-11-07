/** INVENTORY-001 / INV-T03 — a tela do estoque, parte pura. */

import {
  expiringCount,
  expiryText,
  matchesQuery,
  mealsText,
  placeOptions,
  placeTree,
  presentCategories,
  quantityText,
  removalLeavesHouseWithout,
  type ApiHouse,
  type ApiItem,
} from '@/lib/stock-view'

let n = 0
const item = (p: Partial<ApiItem>): ApiItem => ({
  id: `i${++n}`, profileId: 'paulo', locationId: 'casa-p', resourceKey: 'lanterna', label: 'Lanterna', kind: 'DURABLE',
  quantity: 1, unit: 'un', brand: null, model: null, notes: null, expiresOn: null, foodType: null, mealsOverride: null,
  provenance: 'MANUAL', meals: null, ownerName: 'Paulo', createdByName: 'Paulo', updatedByName: 'Paulo', ...p,
})

// Paulo e Daniela, cada um com a sua Casa; garagem na do Paulo; mochila vermelha na garagem; carro solto; despensa vazia.
const house = (items: ApiItem[]): ApiHouse => ({
  me: 'paulo',
  accounts: [{ id: 'paulo', name: 'Paulo', isMe: true }, { id: 'daniela', name: 'Daniela', isMe: false }],
  homeRootIds: ['casa-p', 'casa-d'],
  locations: [
    { id: 'casa-p', parentId: null, name: 'Casa', kind: 'HOME', isDefault: true, profileId: 'paulo', holdingId: null },
    { id: 'casa-d', parentId: null, name: 'Casa', kind: 'HOME', isDefault: true, profileId: 'daniela', holdingId: null },
    { id: 'garagem', parentId: 'casa-p', name: 'Garagem', kind: 'CUSTOM', isDefault: false, profileId: 'paulo', holdingId: null },
    { id: 'despensa', parentId: 'casa-d', name: 'Despensa', kind: 'CUSTOM', isDefault: false, profileId: 'daniela', holdingId: null },
    { id: 'mochila-v', parentId: 'garagem', name: 'Mochila vermelha', kind: 'CUSTOM', isDefault: false, profileId: 'paulo', holdingId: 'bag1' },
    { id: 'carro', parentId: null, name: 'Carro', kind: 'VEHICLE', isDefault: false, profileId: 'paulo', holdingId: null },
  ],
  items,
  totals: { waterLiters: 0, foodPersonDays: 0, itemsAtHome: 0 },
})

describe('árvore de lugares (§3.1, §3.2)', () => {
  const h = house([
    item({ label: 'Rádio', resourceKey: 'radio-comunicacao', profileId: 'daniela', locationId: 'casa-d' }),
    item({ label: 'Lanterna', locationId: 'mochila-v' }),
    item({ id: 'bag1', label: 'Mochila vermelha', resourceKey: 'mochila', locationId: 'garagem' }),
    item({ label: 'Galão', resourceKey: 'agua', quantity: 5, unit: 'gal', locationId: 'carro' }),
  ])
  const tree = placeTree(h, 'Casa')

  it('E20: uma Casa só, com os itens das duas contas', () => {
    expect(tree[0].key).toBe('home')
    expect(tree[0].targetId).toBe('casa-p')
    expect(tree[0].items.map(i => i.label)).toEqual(['Rádio'])
  })
  it('garagem dentro da Casa, mochila dentro da garagem, lanterna dentro da mochila', () => {
    const garagem = tree[0].children.find(c => c.name === 'Garagem')!
    // a mochila não se repete como item: ela é o lugar logo abaixo
    expect(garagem.items.map(i => i.label)).toEqual([])
    const mochila = garagem.children[0]
    expect(mochila).toMatchObject({ isBag: true, bagItemId: 'bag1', depth: 2 })
    expect(mochila.items.map(i => i.label)).toEqual(['Lanterna'])
  })
  it('lugar vazio some; o carro aparece depois da Casa', () => {
    expect(tree[0].children.map(c => c.name)).toEqual(['Garagem'])
    expect(tree.map(t => t.name)).toEqual(['Casa', 'Carro'])
  })
  it('mochila vazia continua aparecendo', () => {
    const t = placeTree(house([]), 'Casa')
    const garagem = t[0].children.find(c => c.name === 'Garagem')!
    expect(garagem.children[0].isBag).toBe(true)
  })
})

describe('opções de lugar', () => {
  it('Casa primeiro (a minha), caminhos completos; sem a mochila e o que tem dentro dela ao mover a mochila', () => {
    const opts = placeOptions(house([]), 'Casa')
    expect(opts[0]).toEqual({ id: 'casa-p', label: 'Casa' })
    expect(opts.map(o => o.label)).toContain('Casa › Garagem › Mochila vermelha')
    expect(opts.map(o => o.label)).toContain('Carro')
    expect(placeOptions(house([]), 'Casa', 'mochila-v').map(o => o.id)).not.toContain('mochila-v')
  })
})

describe('textos', () => {
  it('água em gal e L; comida em kg; contagem; dinheiro', () => {
    expect(quantityText({ quantity: 20, unit: 'gal', resourceKey: 'agua' }, 'pt')).toBe('20 gal (75,7 L)')
    expect(quantityText({ quantity: 10, unit: 'L', resourceKey: 'agua' }, 'en')).toBe('10 L (2.6 gal)')
    expect(quantityText({ quantity: 5000, unit: 'g', resourceKey: 'comida' }, 'pt')).toBe('5 kg')
    expect(quantityText({ quantity: 2, unit: 'un', resourceKey: 'lanterna' }, 'pt')).toBe('2 un.')
    expect(quantityText({ quantity: 50, unit: 'BRL', resourceKey: 'dinheiro' }, 'pt')).toBe('BRL 50')
  })
  it('refeições: estimativa marcada; correção à mão sem etiqueta', () => {
    expect(mealsText({ meals: 27, estimated: true }, 'pt')).toBe('≈ 27 refeições (estimativa)')
    expect(mealsText({ meals: 30, estimated: false }, 'en')).toBe('30 meals')
  })
  it('validade: vencido, vence hoje, vence em N dias; sem data, nada', () => {
    expect(expiryText('2026-11-01', '2026-11-07', 'pt')).toEqual({ state: 'expired', text: 'Vencido' })
    expect(expiryText('2026-11-07', '2026-11-07', 'pt')).toEqual({ state: 'soon', text: 'Vence hoje' })
    expect(expiryText('2026-11-08', '2026-11-07', 'pt')?.text).toBe('Vence em 1 dia')
    expect(expiryText('2026-12-07', '2026-11-07', 'en')?.text).toBe('Expires in 30 days')
    expect(expiryText('2027-01-01', '2026-11-07', 'pt')).toBeNull()
    expect(expiryText(null, '2026-11-07', 'pt')).toBeNull()
  })
})

describe('avisos', () => {
  it('critério 11: conta vencidos e a vencer em 30 dias', () => {
    const h = house([item({ expiresOn: '2026-11-01' }), item({ expiresOn: '2026-11-20' }), item({ expiresOn: '2027-05-01' }), item({})])
    expect(expiringCount(h, '2026-11-07')).toBe(2)
  })
  it('remover o único rádio da casa avisa; com outro rádio, não; o do carro não conta; item livre nunca', () => {
    const r1 = item({ resourceKey: 'radio-comunicacao' })
    expect(removalLeavesHouseWithout(house([r1]), r1)).toBe(true)
    const r2 = item({ resourceKey: 'radio-comunicacao', profileId: 'daniela', locationId: 'casa-d' })
    expect(removalLeavesHouseWithout(house([r1, r2]), r1)).toBe(false)
    const noCarro = item({ resourceKey: 'radio-comunicacao', locationId: 'carro' })
    expect(removalLeavesHouseWithout(house([r1, noCarro]), r1)).toBe(true)
    const faca = item({ resourceKey: 'custom:faca' })
    expect(removalLeavesHouseWithout(house([faca]), faca)).toBe(false)
  })
  it('categorias presentes na ordem do catálogo', () => {
    expect(presentCategories(house([item({ resourceKey: 'radio-comunicacao' }), item({ resourceKey: 'agua' })]))).toEqual(['agua', 'comunicacao'])
  })
  it('busca sem acento em nome, marca e modelo', () => {
    const i = item({ label: 'Rádio', brand: 'Midland', model: 'ER310' })
    expect(matchesQuery(i, 'radio')).toBe(true)
    expect(matchesQuery(i, 'er31')).toBe(true)
    expect(matchesQuery(i, 'lanterna')).toBe(false)
  })
})
