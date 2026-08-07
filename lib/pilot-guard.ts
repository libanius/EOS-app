/**
 * A regra crítica sobrepõe a IA (D-125 / PILOT-T03).
 *
 * O cabeçalho de `app/api/pilot/chat/route.ts` dizia, desde sempre, que o Pilot
 * *"can never soften a critical rule"*. O código não fazia nada disso: pegava o
 * texto do modelo e devolvia. Era uma promessa escrita em comentário, e o
 * roteiro sabia — `PILOT-T03` está BLOCKED com a nota "Critical rules must
 * override AI".
 *
 * Num app de emergência isso não é detalhe de qualidade. O modelo pode escrever
 * uma frase tranquilizadora enquanto a casa tem meio dia de água, e nada na
 * resposta contradiz. A pessoa lê a frase, não a planilha.
 *
 * ESTE MÓDULO NÃO CORRIGE O MODELO — ELE O SOBREPÕE. O veredito é calculado
 * pelo `RulesEngine`, que é determinístico, e viaja ao lado da resposta. Quando
 * há regra crítica ativa, a interface mostra o veredito ANTES do texto, e o
 * texto do modelo deixa de ser a primeira coisa que a pessoa lê.
 *
 * Por que não simplesmente reescrever a resposta do modelo: porque aí a
 * verificação viraria outra geração de texto, sujeita ao mesmo problema. Uma
 * trava que depende do modelo obedecer não é uma trava.
 */

import { RulesEngine } from '@/lib/rules-engine'
import { UrgencyLevel } from '@/lib/types'
import type { Household } from '@/lib/household'
import { autonomyDays } from '@/lib/household'

/**
 * Os cinco estados do PILOT-T03.
 *
 * `PRIORITY_OVERRIDE` é diferente dos outros quatro: os quatro descrevem uma
 * recomendação, ele descreve que a recomendação foi TOMADA da IA.
 */
export type PilotVerdict = 'GO' | 'LIMITED' | 'WAIT' | 'AVOID' | 'PRIORITY_OVERRIDE'

export type PilotGuard = {
  verdict: PilotVerdict
  /** Frase curta que a interface mostra ACIMA do texto do modelo. */
  headline: string
  /** As regras determinísticas que dispararam, na língua do usuário. */
  rules: string[]
  /**
   * Verdadeiro quando o veredito não é negociável.
   *
   * A interface trata isto como conteúdo do produto, não como sugestão: fica
   * visível mesmo que a pessoa não leia o resto.
   */
  binding: boolean
  /** Dias de autonomia usados na decisão. `null` quando a casa não pôde ser lida. */
  autonomyDays: number | null
}

/**
 * A mensagem do motor traduzida para quem lê sob pressão.
 *
 * O `RulesEngine` escreve para máquina — `FOOD_LOW: 1.0 dias`, `SEM_COMMS`. Na
 * primeira versão eu cobri três chaves e as outras oito vazaram cruas para a
 * tela. Um teste unitário fecha isso: se alguém acrescentar uma regra e
 * esquecer a frase, ele acusa antes de a sigla chegar ao usuário.
 */
const FRASES: Record<string, { pt: string; en: string }> = {
  WATER_CRITICAL: {
    pt: 'Água abaixo do mínimo. Reabastecer vem antes de qualquer outra coisa.',
    en: 'Water below the minimum. Refilling comes before anything else.',
  },
  WATER_LOW: {
    pt: 'Água apertada para o tamanho da casa.',
    en: 'Water is tight for the size of the household.',
  },
  FOOD_CRITICAL: {
    pt: 'Comida abaixo do mínimo para a sua casa.',
    en: 'Food below the minimum for your household.',
  },
  FOOD_LOW: {
    pt: 'Comida apertada para o tamanho da casa.',
    en: 'Food is tight for the size of the household.',
  },
  SEM_COMMS: {
    pt: 'Sem meio de comunicação registrado — ninguém te alcança se a rede cair.',
    en: 'No communication device recorded — nobody reaches you if the network drops.',
  },
  FALLOUT: {
    pt: 'Contaminação: abrigo no local é obrigatório antes de qualquer deslocamento.',
    en: 'Fallout: shelter in place is mandatory before any movement.',
  },
  EARTHQUAKE: {
    pt: 'Risco de réplicas — evite estruturas comprometidas.',
    en: 'Aftershock risk — avoid compromised structures.',
  },
  'PRIORIDADE: Nutrição do bebê': {
    pt: 'Bebê em casa: alimentação dele vem antes na lista.',
    en: 'Infant at home: their feeding comes first on the list.',
  },
  'PRIORIDADE: Continuidade de medicação': {
    pt: 'Alguém depende de medicação contínua — garantir o estoque vem antes.',
    en: 'Someone depends on ongoing medication — securing supply comes first.',
  },
  'PRIORIDADE: Evacuação acessível': {
    pt: 'Alguém não se desloca sozinho: a rota precisa ser acessível.',
    en: 'Someone cannot move unaided: the route must be accessible.',
  },
}

/** As chaves que o motor pode emitir. Usado pelo teste que impede vazamento. */
export const CHAVES_DE_REGRA = Object.keys(FRASES)

function frase(mensagem: string, pt: boolean): string {
  // Mais específico primeiro: "PRIORIDADE: Nutrição do bebê" antes de qualquer
  // prefixo curto que também casaria.
  const chaves = Object.keys(FRASES).sort((a, b) => b.length - a.length)
  for (const chave of chaves) {
    if (mensagem.startsWith(chave)) return pt ? FRASES[chave].pt : FRASES[chave].en
  }
  return mensagem
}

/**
 * Calcula o veredito a partir do estado real da casa.
 *
 * Nada aqui olha para o que o modelo respondeu, de propósito: o veredito
 * precisa ser o mesmo com ou sem IA, e precisa poder ser calculado quando a IA
 * está fora do ar.
 */
export function evaluateGuard(
  household: Household,
  opts: { pt: boolean; alerts?: number; hasCommsDevice?: boolean },
): PilotGuard {
  /*
   * Casa desconhecida NÃO vale GO.
   *
   * Se a leitura falhou, dizer "pode ir" é inventar. O estado certo é WAIT com
   * o motivo dito — a pessoa fica sabendo que a resposta está incompleta, em
   * vez de receber uma tranquilização sem base.
   */
  if (!household.known || household.size < 1) {
    return {
      verdict: 'WAIT',
      headline: opts.pt
        ? 'Não consegui ler quem mora na sua casa — trate esta resposta como incompleta.'
        : 'I could not read who lives in your household — treat this answer as incomplete.',
      rules: [],
      binding: true,
      autonomyDays: null,
    }
  }

  const dias = autonomyDays(household.inventory, household.size)
  const resultado = RulesEngine.evaluate({
    people_count: Math.max(1, household.size),
    water_liters: household.inventory.waterLiters,
    food_days: household.size > 0 ? household.inventory.foodPersonDays / household.size : 0,
    has_infants: household.people.some(p => p.isInfant),
    has_medical_conditions:
      household.needsHidden > 0 ||
      household.people.some(p => p.medicalConditions.length > 0 || p.medications.length > 0),
    // Quem não se desloca sozinho muda a regra de evacuação: o motor conta
    // essas pessoas, e a casa do D-123 sabe quem são.
    mobility_impaired: household.people.filter(p => p.mobilityImpaired).length,
    has_communication_device: opts.hasCommsDevice ?? household.inventory.hasCommunicationDevice,
  })

  const regras = resultado.rulesApplied.map(m => frase(m, opts.pt))

  if (resultado.urgency === UrgencyLevel.CRITICAL) {
    return {
      verdict: 'PRIORITY_OVERRIDE',
      headline: opts.pt
        ? 'Há uma condição crítica na sua casa agora. Isto vem antes do que foi perguntado.'
        : 'There is a critical condition in your household right now. This comes before what was asked.',
      rules: regras,
      binding: true,
      autonomyDays: dias,
    }
  }

  if (resultado.urgency === UrgencyLevel.HIGH) {
    return {
      verdict: 'AVOID',
      headline: opts.pt
        ? `Sua casa aguenta ${dias.toFixed(1)} dia(s). Evite qualquer coisa que consuma reserva.`
        : `Your household lasts ${dias.toFixed(1)} day(s). Avoid anything that spends reserve.`,
      rules: regras,
      binding: true,
      autonomyDays: dias,
    }
  }

  // Alerta meteorológico ativo muda a resposta mesmo com a despensa cheia: o
  // limite passa a ser lá fora, não dentro de casa.
  if ((opts.alerts ?? 0) > 0) {
    return {
      verdict: 'WAIT',
      headline: opts.pt
        ? 'Há alerta ativo na sua área. Espere passar antes de sair.'
        : 'There is an active alert in your area. Wait for it to pass before going out.',
      rules: regras,
      binding: false,
      autonomyDays: dias,
    }
  }

  if (resultado.urgency === UrgencyLevel.MEDIUM) {
    return {
      verdict: 'LIMITED',
      headline: opts.pt
        ? `Dá para seguir, com limite: ${dias.toFixed(1)} dia(s) de autonomia.`
        : `You can proceed, with a limit: ${dias.toFixed(1)} day(s) of autonomy.`,
      rules: regras,
      binding: false,
      autonomyDays: dias,
    }
  }

  return {
    verdict: 'GO',
    headline: opts.pt
      ? `Casa em condição de seguir: ${dias.toFixed(1)} dia(s) de autonomia.`
      : `Household is in shape to proceed: ${dias.toFixed(1)} day(s) of autonomy.`,
    rules: regras,
    binding: false,
    autonomyDays: dias,
  }
}

/**
 * O veredito do motor traduzido para o vocabulário que o chat já usa.
 *
 * A primeira versão enfiava a frase determinística DENTRO do texto da resposta,
 * em markdown. O dono cortou, com razão: isso suja o chat livre e mistura duas
 * coisas que precisam ser lidas de formas diferentes. O veredito é ETIQUETA —
 * ele fica ao lado da resposta, não dentro dela.
 *
 * E o vocabulário é o mesmo do motor local (`pilot-engine`), porque duas
 * mecânicas de veredito na mesma tela é como o produto passa a discordar de si.
 */
export function guardToTag(guard: PilotGuard): 'ready' | 'watch' | 'hold' | 'act' {
  switch (guard.verdict) {
    case 'GO': return 'ready'
    case 'LIMITED': return 'watch'
    case 'WAIT': return 'hold'
    case 'AVOID':
    case 'PRIORITY_OVERRIDE': return 'act'
  }
}
