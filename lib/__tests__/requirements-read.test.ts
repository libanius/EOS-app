/**
 * A projeção de leitura depois do cutover (PREP-T10d / D-176).
 *
 * `legacyKitType` é a projeção LOSSY assumida: ela existe para as telas antigas
 * continuarem funcionando, e é justamente a perda que o cutover veio encerrar
 * para quem lê os campos novos.
 */
import { legacyKitType } from '@/lib/requirements-read'
import { splitKitType } from '@/lib/requirements'

describe('kit_type sintetizado para telas legadas', () => {
  it('kit de verdade sai como o próprio slug', () => {
    expect(legacyKitType('BUG_OUT', 'MANUAL')).toBe('BUG_OUT')
  })

  it('sem kit, a procedência vira o valor legado correspondente', () => {
    expect(legacyKitType(null, 'PILOT')).toBe('PILOT_RECOMMENDATION')
    expect(legacyKitType(null, 'EDU')).toBe('EDU_CONTENT')
    expect(legacyKitType(null, 'SIMULATION')).toBe('SIMULATION_DEBRIEF')
    expect(legacyKitType(null, 'OFFICIAL_ALERT')).toBe('OFFICIAL_ALERT')
  })

  it('linha de base manual sai como GERAL', () => {
    expect(legacyKitType(null, 'MANUAL')).toBe('GERAL')
  })

  it('procedência sem valor legado cai para GERAL', () => {
    // `PLAN_GAP` nunca existiu como kit_type; virar GERAL é melhor que sumir.
    expect(legacyKitType(null, 'PLAN_GAP')).toBe('GERAL')
  })

  it('ida e volta é fiel quando só UMA dimensão existe', () => {
    for (const [slug, prov] of [['BUG_OUT', 'MANUAL'], [null, 'PILOT'], [null, 'MANUAL']] as const) {
      const kt = legacyKitType(slug, prov)
      const devolta = splitKitType(kt)
      expect(devolta.kitSlug).toBe(slug)
      if (slug === null) expect(devolta.provenance).toBe(prov)
    }
  })

  it('E É LOSSY quando as duas existem — o motivo do cutover congelar o legado', () => {
    /*
     * Um item da Bug Out sugerido pelo Pilot tem kit E procedência. `kit_type`
     * guarda uma dimensão só: o kit vence, e a procedência se perde na volta.
     *
     * É por isso que `checklists` foi CONGELADA em vez de mantida em sincronia
     * — sincronizar exigiria escolher qual informação destruir a cada escrita.
     */
    const kt = legacyKitType('BUG_OUT', 'PILOT')
    expect(kt).toBe('BUG_OUT')

    const devolta = splitKitType(kt)
    expect(devolta.kitSlug).toBe('BUG_OUT')
    expect(devolta.provenance).toBe('MANUAL')   // ← a procedência PILOT sumiu
    expect(devolta.provenance).not.toBe('PILOT')
  })
})
