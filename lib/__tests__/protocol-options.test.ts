import { optionUrlAllowed, protocolOptionsProblems, protocolView, type ProtocolOption } from '../signals'
import { packageProblems, type ContentPackage } from '../content-package'
import { optionStockItem, optionStockNote } from '../protocol-choice'
import type { ApiItem } from '../stock-view'
import water from '../../content/pautas/agua-cinco-metodos-filtro-dois-baldes.v2.json'

const pkg = water as ContentPackage
const protocol = pkg.signal.protocol
const options = protocol.items.find(item => item.resourceKey === 'filtro-agua')!.options!
const item = (id: string, owner = 'me', brand: string | null = null, model: string | null = null) => ({ id, profileId: owner, brand, model, resourceKey: 'filtro-agua', quantity: 1 } as ApiItem)

it('inclui todas as cinco alternativas na pauta válida, sem cinco requisitos', () => {
  expect(options.map(option => option.id)).toEqual(['steripen-ultra', 'grayl-geopress', 'lifestraw-mission', 'lifestraw-escape', 'diy-dois-baldes'])
  expect(packageProblems(pkg)).toEqual([])
  expect(protocol.items.filter(item => item.resourceKey === 'filtro-agua')).toHaveLength(1)
  expect(options.every(option => !option.purchaseUrl)).toBe(true)
  for (const option of options) for (const lang of ['pt', 'en'] as const) {
    expect(optionStockNote(option, lang)).toBe(option.limitation[lang])
    expect(optionStockNote(option, lang).length).toBeLessThanOrEqual(500)
  }
})

it('alternativas não mudam a conta da casa nem a água armazenada', () => {
  const without = JSON.parse(JSON.stringify(protocol))
  without.items.forEach((item: { options?: ProtocolOption[] }) => { delete item.options })
  const house = { known: true, size: 3, waterLiters: 80, foodPersonDays: 42, hasMedicalKit: false, hasCommunicationDevice: false }
  const own = new Set(['filtro-agua'])
  const view = protocolView(protocol, 'D14', house, own)
  const baseline = protocolView(without, 'D14', house, own)
  const coverage = (result: typeof view) => ({ ...result, items: result.items.map(({ item: requirement, ...state }) => ({ resourceKey: requirement.resourceKey, ...state })) })
  expect(coverage(view)).toEqual(coverage(baseline))
})

it('rejeita ids repetidos, idioma ausente e URL insegura', () => {
  expect(protocolOptionsProblems([options[0], options[0]]).join()).toMatch(/repetida/)
  expect(protocolOptionsProblems([{ ...options[0], limitation: { pt: '', en: 'limit' } }]).join()).toMatch(/limitation/)
  expect(protocolOptionsProblems([{ ...options[0], purchaseUrl: 'javascript:alert(1)' }]).join()).toMatch(/HTTPS/)
  expect(protocolOptionsProblems({})).toHaveLength(1)
  expect(protocolOptionsProblems(undefined)).toEqual([])
  expect(optionUrlAllowed('https://user:pass@example.com')).toBe(false)
  expect(optionUrlAllowed('https://example.com/product')).toBe(true)
})

it('detalha o único filtro genérico próprio sem duplicá-lo', () => {
  const generic = item('generic')
  expect(optionStockItem([generic], options[0], 'me')).toBe(generic)
})

it('reabre o modelo exato e não altera item de outra conta', () => {
  const exact = item('exact', 'me', options[0].brand, options[0].model)
  const other = item('other', 'someone')
  expect(optionStockItem([item('generic'), exact, other], options[0], 'me')).toBe(exact)
  expect(optionStockItem([other], options[0], 'me')).toBeNull()
  expect(optionStockItem([item('one'), item('two')], options[0], 'me')).toBeNull()
  expect(optionStockItem([exact], options[0], null)).toBeNull()
})
