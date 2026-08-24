/**
 * Ciclo de vida do requisito (PREP-T10 fase 1 / D-171).
 *
 * Spec: `docs/37-preparedness-state.md` §19, que rejeitou o ciclo de oito
 * estados como software de compras — seis deles eram afordância de interface ou
 * derivados. Ficam quatro:
 *
 *   proposed        sugerido; nada é verdade ainda
 *   needed          o usuário confirmou que precisa      ← só o usuário move
 *   met             existe cobertura
 *   not_applicable  descartado para esta família
 *
 * ── O que esta fase entrega ───────────────────────────────────────────────
 *
 * `not_applicable`. Hoje quem não precisa de um item só pode APAGÁ-LO, e a
 * próxima geração de checklist o traz de volta. Apagar é dizer "some da tela";
 * "não se aplica" é dizer "esta casa não precisa disto" — uma decisão sobre a
 * própria família, que o app tem obrigação de lembrar.
 *
 * ── O que esta fase NÃO entrega, e por quê ────────────────────────────────
 *
 * `met` continua vindo do usuário. O destino é derivá-lo da cobertura por
 * holdings — "não se marca prontidão, adquire-se coisas" —, mas `holdings`
 * ainda está vazia: derivar agora faria a caixinha de marcar parar de
 * funcionar, porque nada cobriria nada. **A interface não pode prometer o que o
 * domínio ainda não sustenta** (`docs/37` §33). Vira PREP-T10c, depois do
 * backfill.
 */

export type AcquisitionStatus = 'proposed' | 'needed' | 'met' | 'not_applicable'

export const ACQUISITION_STATUSES: AcquisitionStatus[] = [
  'proposed', 'needed', 'met', 'not_applicable',
]

/**
 * Quem pode mover o quê.
 *
 * `system` são Pilot, EDU, simulação e alerta — as fontes que PROPÕEM. Elas
 * podem criar em `proposed` e nada mais: promover a própria sugestão a
 * necessidade confirmada é exatamente a escrita silenciosa que a arquitetura
 * proíbe (`docs/37` §4).
 */
export type Actor = 'user' | 'system' | 'derived'

const TRANSICOES: Array<{ de: AcquisitionStatus; para: AcquisitionStatus; por: Actor[] }> = [
  // O usuário confirma uma sugestão.
  { de: 'proposed', para: 'needed', por: ['user'] },
  // Ou a descarta de vez — e descartar é decisão dele, não do sistema.
  { de: 'proposed', para: 'not_applicable', por: ['user'] },

  // Hoje o usuário marca que tem. Em PREP-T10c isto passa a ser `derived`.
  { de: 'needed', para: 'met', por: ['user', 'derived'] },
  { de: 'needed', para: 'not_applicable', por: ['user'] },

  // Desmarcar: tinha e acabou, ou marcou por engano.
  { de: 'met', para: 'needed', por: ['user', 'derived'] },

  // Voltar atrás sobre "não se aplica" é sempre permitido ao usuário: uma
  // decisão sobre a casa pode mudar quando a casa muda.
  { de: 'not_applicable', para: 'needed', por: ['user'] },
]

export function canTransition(de: AcquisitionStatus, para: AcquisitionStatus, por: Actor): boolean {
  if (de === para) return true
  return TRANSICOES.some(t => t.de === de && t.para === para && t.por.includes(por))
}

/**
 * O estado que corresponde ao booleano legado.
 *
 * `acquired` é a única verdade em produção hoje, e continua sendo mantida em
 * paralelo até o cutover. Esta função é o ponto único de tradução.
 */
export function statusFromLegacy(acquired: boolean): AcquisitionStatus {
  return acquired ? 'met' : 'needed'
}

/**
 * O booleano que corresponde ao estado.
 *
 * `not_applicable` vira `false`: para o mundo antigo, um item descartado é um
 * item não adquirido. Perde-se a distinção — e é justamente por isso que a
 * coluna nova existe.
 */
export function legacyFromStatus(status: AcquisitionStatus): boolean {
  return status === 'met'
}

/**
 * Este requisito conta como pendente?
 *
 * `not_applicable` NÃO conta: a família decidiu que não precisa, e continuar
 * cobrando seria transformar uma decisão dela em dívida permanente.
 * `proposed` também não: ainda não foi confirmado como necessário, e contar
 * sugestão como falta deixaria qualquer fonte piorar a prontidão da casa
 * sozinha.
 */
export function countsAsMissing(status: AcquisitionStatus): boolean {
  return status === 'needed'
}

/**
 * Entra na conta de progresso do tier?
 *
 * Mesma lógica: o denominador ignora o que foi descartado. Um checklist de 10
 * itens onde 3 não se aplicam é um checklist de 7 — mostrar 7/10 para sempre
 * ensinaria que a barra nunca fecha.
 */
export function countsInProgress(status: AcquisitionStatus): boolean {
  return status === 'needed' || status === 'met'
}
