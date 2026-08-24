/**
 * Ciclo de vida do requisito (PREP-T10 fase 1 / D-171).
 *
 * O teste que mais importa: **o sistema não promove a própria sugestão.** Pilot,
 * EDU, simulação e alerta podem propor; confirmar é do usuário. Sem essa trava,
 * qualquer fonte passaria a criar dívida na casa de alguém sozinha.
 */
import {
  ACQUISITION_STATUSES,
  canTransition,
  countsAsMissing,
  countsInProgress,
  legacyFromStatus,
  statusFromLegacy,
  type AcquisitionStatus,
} from '@/lib/acquisition'

describe('transições', () => {
  it('o usuário confirma uma sugestão', () => {
    expect(canTransition('proposed', 'needed', 'user')).toBe(true)
  })

  it('O SISTEMA NÃO promove a própria sugestão', () => {
    // Escrita silenciosa a partir de fonte automática é o que a arquitetura
    // proíbe. Propor é de todos; confirmar é do usuário.
    expect(canTransition('proposed', 'needed', 'system')).toBe(false)
    expect(canTransition('proposed', 'met', 'system')).toBe(false)
  })

  it('e não descarta por conta própria', () => {
    expect(canTransition('proposed', 'not_applicable', 'system')).toBe(false)
    expect(canTransition('needed', 'not_applicable', 'system')).toBe(false)
  })

  it('hoje o usuário marca que tem; amanhã a cobertura marca', () => {
    expect(canTransition('needed', 'met', 'user')).toBe(true)
    expect(canTransition('needed', 'met', 'derived')).toBe(true)
  })

  it('dá para desmarcar — tinha e acabou', () => {
    expect(canTransition('met', 'needed', 'user')).toBe(true)
  })

  it('dá para voltar atrás sobre "não se aplica"', () => {
    // Uma decisão sobre a casa pode mudar quando a casa muda.
    expect(canTransition('not_applicable', 'needed', 'user')).toBe(true)
  })

  it('não se pula de descartado direto para adquirido', () => {
    expect(canTransition('not_applicable', 'met', 'user')).toBe(false)
  })

  it('ficar parado é sempre permitido', () => {
    for (const s of ACQUISITION_STATUSES) {
      expect(canTransition(s, s, 'system')).toBe(true)
    }
  })
})

describe('tradução do legado', () => {
  it('ida e volta preserva o que o booleano sabe representar', () => {
    expect(statusFromLegacy(true)).toBe('met')
    expect(statusFromLegacy(false)).toBe('needed')
    expect(legacyFromStatus('met')).toBe(true)
    expect(legacyFromStatus('needed')).toBe(false)
  })

  it('"não se aplica" vira falso no mundo antigo — e a distinção se perde', () => {
    // É exatamente por isso que a coluna nova existe.
    expect(legacyFromStatus('not_applicable')).toBe(false)
    expect(legacyFromStatus('proposed')).toBe(false)
  })
})

describe('o que conta como falta', () => {
  it('só o confirmado como necessário', () => {
    expect(countsAsMissing('needed')).toBe(true)
  })

  it('descartado NÃO conta — decisão da família não é dívida permanente', () => {
    expect(countsAsMissing('not_applicable')).toBe(false)
  })

  it('proposta NÃO conta — fonte automática não piora a prontidão sozinha', () => {
    expect(countsAsMissing('proposed')).toBe(false)
  })

  it('adquirido não conta', () => {
    expect(countsAsMissing('met')).toBe(false)
  })
})

describe('o que entra na barra de progresso', () => {
  it('o denominador ignora o descartado', () => {
    /*
     * Um checklist de 10 onde 3 não se aplicam é um checklist de 7. Mostrar
     * 7/10 para sempre ensinaria que a barra nunca fecha.
     */
    const lista: AcquisitionStatus[] = ['met', 'met', 'needed', 'not_applicable', 'not_applicable']
    expect(lista.filter(countsInProgress)).toHaveLength(3)
  })

  it('e ignora a proposta ainda não confirmada', () => {
    expect(countsInProgress('proposed')).toBe(false)
  })
})
