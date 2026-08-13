/**
 * O briefing precisa terminar em ação (PREP-T14 / D-166).
 *
 * O teste que mais importa é o que separa DIAGNÓSTICO de AÇÃO: transformar
 * "água abaixo do mínimo" numa tarefa produz um item que ninguém consegue
 * executar nem marcar como feito — e uma lista cheia desses é pior que lista
 * nenhuma, porque ensina a ignorar a lista.
 */
import { BRIEFING_KIT_TYPE, buildBriefingProposals } from '@/lib/briefing-actions'
import { splitKitType } from '@/lib/requirements'

const nomes = (s: Parameters<typeof buildBriefingProposals>[0]) =>
  buildBriefingProposals(s).map(p => p.name)

describe('próximos passos viram propostas', () => {
  it('cada passo vira uma proposta confirmável', () => {
    const saida = buildBriefingProposals({
      next_steps: ['Comprar 3 galões de água', 'Separar cópias dos documentos'],
    })
    expect(saida).toHaveLength(2)
    expect(saida[0]).toMatchObject({ tier: 'ESSENTIAL', quantity: 1, unit: null, from: 'next_steps' })
  })

  it('limpa marcação e numeração do modelo', () => {
    expect(nomes({ next_steps: ['**1. Comprar água**', '- Revisar o plano da família'] }))
      .toEqual(['Comprar água', 'Revisar o plano da família'])
  })

  it('corta o que é longo demais para uma linha', () => {
    const longo = 'Comprar ' + 'água '.repeat(40)
    const [nome] = nomes({ next_steps: [longo] })
    expect(nome.length).toBeLessThanOrEqual(96)
    expect(nome.endsWith('...')).toBe(true)
  })

  it('ignora fragmentos curtos demais para significar algo', () => {
    expect(nomes({ next_steps: ['ok', 'sim', ''] })).toEqual([])
  })
})

describe('prioridade só entra quando é AÇÃO', () => {
  it('diagnóstico não vira tarefa', () => {
    // "Água abaixo do mínimo" descreve um estado. Não há o que executar.
    expect(nomes({ priorities: ['Água abaixo do mínimo recomendado'] })).toEqual([])
  })

  it('prioridade escrita como ação entra', () => {
    expect(nomes({ priorities: ['Adquira um rádio de emergência'] }))
      .toEqual(['Adquira um rádio de emergência'])
  })

  it('a origem de cada proposta fica registrada', () => {
    const saida = buildBriefingProposals({
      next_steps: ['Comprar lanterna'],
      priorities: ['Revise o ponto de encontro'],
    })
    expect(saida.map(p => p.from)).toEqual(['next_steps', 'priorities'])
  })
})

describe('forças nunca viram tarefa', () => {
  it('o campo não é sequer lido', () => {
    // @ts-expect-error — provar que `strengths` não entra no contrato
    expect(nomes({ strengths: ['Comprar mais água'] })).toEqual([])
  })
})

describe('o item precisa carregar o próprio contexto (D-167)', () => {
  /*
   * Achado do dono, com a saída REAL do modelo. O item sobrevive ao briefing:
   * o cartão some, a linha fica. "Atrapalha ter que criar um lembrete e depois
   * lembrar do que o lembrete me lembrou."
   */
  const realDoModelo = {
    priorities: [
      'Repor alimentos para garantir ao menos 7 dias de suprimento',
      'Garantir medicamentos de uso contínuo (ex: Loratadine) para estoque mínimo de 7 dias',
      'Reservar dinheiro em espécie para emergências',
    ],
    next_steps: [
      'Comprar mais alimentos não perecíveis, suficientes para 3 dias extras',
      'Separar e armazenar medicamentos essenciais para todos da casa',
      'Montar envelope com dinheiro em espécie acessível',
      'Revisar cargas de energia e opções de recarga se houver eletrônicos críticos',
    ],
  }

  it('descarta o passo genérico sobre medicamentos', () => {
    expect(nomes(realDoModelo)).not.toContain('Separar e armazenar medicamentos essenciais para todos da casa')
  })

  it('e mantém a prioridade que NOMEIA o medicamento', () => {
    expect(nomes(realDoModelo)).toContain(
      'Garantir medicamentos de uso contínuo (ex: Loratadine) para estoque mínimo de 7 dias',
    )
  })

  it('categoria vaga COM número passa — o número é a âncora', () => {
    expect(nomes({ next_steps: ['Comprar 3 dias de alimentos essenciais'] })).toHaveLength(1)
  })

  it('categoria vaga SEM âncora nenhuma não passa', () => {
    expect(nomes({ next_steps: ['Comprar alimentos essenciais'] })).toEqual([])
  })

  it('frase sem categoria vaga passa mesmo sem número', () => {
    // "Montar envelope com dinheiro em espécie" é executável como está.
    expect(nomes({ next_steps: ['Montar envelope com dinheiro em espécie acessível'] })).toHaveLength(1)
  })
})

describe('infinitivo é ação (D-167)', () => {
  it('a forma dominante de tarefa em português é aceita', () => {
    // A lista de verbos só tinha imperativos, então TODA prioridade escrita no
    // infinitivo era descartada — inclusive as específicas.
    const saida = nomes({ priorities: ['Garantir 7 dias de Loratadine para a Maria'] })
    expect(saida).toHaveLength(1)
  })

  it('diagnóstico continua fora', () => {
    expect(nomes({ priorities: ['Água abaixo do mínimo recomendado', 'Kit médico disponível'] })).toEqual([])
  })
})

describe('duplicata', () => {
  it('a mesma ideia em prioridades e próximos passos vira UMA proposta', () => {
    // O modelo repete entre os dois campos com frequência; duas linhas iguais
    // na tela virariam duas linhas iguais no checklist.
    const saida = nomes({
      next_steps: ['Comprar 3 galões de água'],
      priorities: ['comprar 3 galões de água'],
    })
    expect(saida).toEqual(['Comprar 3 galões de água'])
  })

  it('não passa de cinco propostas', () => {
    const muitos = Array.from({ length: 12 }, (_, i) => `Comprar item número ${i}`)
    expect(nomes({ next_steps: muitos })).toHaveLength(5)
  })
})

describe('entrada vazia ou malformada', () => {
  it('não quebra e não inventa', () => {
    expect(buildBriefingProposals({})).toEqual([])
    expect(buildBriefingProposals({ next_steps: [] })).toEqual([])
    // @ts-expect-error — o modelo pode devolver qualquer coisa
    expect(buildBriefingProposals({ next_steps: [null, undefined, 42] })).toEqual([])
  })
})

describe('procedência', () => {
  it('grava como recomendação do Pilot, sem procedência nova', () => {
    expect(BRIEFING_KIT_TYPE).toBe('PILOT_RECOMMENDATION')
  })

  it('e é lida como requisito de linha de base com procedência PILOT', () => {
    // Fecha o ciclo com D-161: o item confirmado aparece em "O que falta" com
    // o selo "via Pilot", e não como um kit inventado.
    expect(splitKitType(BRIEFING_KIT_TYPE)).toEqual({ kitSlug: null, provenance: 'PILOT' })
  })
})
