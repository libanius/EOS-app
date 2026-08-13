/**
 * O briefing de prontidão precisa terminar em AÇÃO (PREP-T14 / D-166).
 *
 * ── O defeito, apontado pelo dono ─────────────────────────────────────────
 *
 * `/api/ai/readiness` produzia visão geral, prioridades, forças e próximos
 * passos — tudo em prosa, tudo sem saída. A pessoa lia "aumente a reserva de
 * água" e não tinha o que tocar.
 *
 * Isso contraria a regra 1 do próprio D-085:
 *
 *   > "Preparação é acionável ou não pertence aqui. Conteúdo que não produz
 *   > entendimento, uma tarefa, um material, um papel, uma revisão de plano ou
 *   > uma melhoria de comunicação fica fora."
 *
 * O EOS escrevia a regra e não a cumpria na própria tela de prontidão. Aqui
 * ela passa a valer: o briefing propõe, o usuário confirma, e a proposta vira
 * requisito com procedência visível.
 *
 * ── O que este módulo NÃO faz ─────────────────────────────────────────────
 *
 * Não escreve nada. Devolve propostas; quem persiste é a tela, item a item,
 * depois da confirmação — o mesmo contrato de Pilot (D-093), EDU (D-119) e
 * debrief da simulação (D-092). Escrita silenciosa a partir de saída de modelo
 * é exatamente o que a arquitetura proíbe (docs/37 §4).
 */

import type { ChecklistTier } from './checklist'
import { cleanEduActionText, looksActionable } from './edu-actions'

export type BriefingProposal = {
  name: string
  tier: ChecklistTier
  quantity: number
  unit: string | null
  /** De qual campo do briefing veio — a tela mostra, e a fonte é obrigatória. */
  from: 'next_steps' | 'priorities'
}

export type BriefingSource = {
  priorities?: string[]
  next_steps?: string[]
}

const MAX_LENGTH = 96

/*
 * Palavras que substituem a COISA por uma categoria. Sozinhas não condenam;
 * condenam quando não há nenhuma âncora concreta na frase.
 *
 * "críticos", "acessível" e afins ficam DE FORA: qualificam a condição, não o
 * objeto, e incluí-los derrubaria itens executáveis.
 */
const CATEGORIA_VAGA = /\b(essenciais?|important(es)?|necess[áa]ri[oa]s?|adequad[oa]s?|apropriad[oa]s?|divers[oa]s|v[áa]ri[oa]s|b[áa]sic[oa]s|gerais?)\b/i

/**
 * A frase se sustenta sozinha?
 *
 * Uma âncora concreta é: um número ("7 dias", "3 galões"), um parêntese de
 * exemplo ("(ex: Loratadine)") ou um nome próprio no meio da frase — as três
 * formas em que o modelo cita a coisa específica.
 */
function temAncoraConcreta(texto: string): boolean {
  if (/\d/.test(texto)) return true
  if (/\([^)]{2,}\)/.test(texto)) return true
  // Maiúscula que não é a primeira palavra: nome de remédio, marca, lugar.
  return /\s[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]{2,}/.test(texto)
}

/**
 * O item precisa carregar o próprio contexto (D-167).
 *
 * Achado do dono: o briefing propôs "separar e armazenar medicamentos
 * essenciais para todos da casa" enquanto a PRIORIDADE, logo acima, dizia
 * "(ex: Loratadine) para estoque mínimo de 7 dias". A informação existia e se
 * perdeu no caminho para a tarefa.
 *
 * Isso importa porque **o item sobrevive ao briefing**: o cartão some, a linha
 * fica no checklist. Nas palavras do dono — "atrapalha ter que criar um
 * lembrete e depois lembrar do que o lembrete me lembrou". Um lembrete que
 * exige lembrar do que ele lembrava é pior que nenhum.
 *
 * A correção de raiz é o prompt (`/api/ai/readiness`), que agora diz ao modelo
 * que estes passos viram tarefas independentes. Isto aqui é a rede.
 */
export function carregaProprioContexto(texto: string): boolean {
  if (!CATEGORIA_VAGA.test(texto)) return true
  return temAncoraConcreta(texto)
}
const MAX_PROPOSTAS = 5

function normalizar(valor: string): string {
  const limpo = cleanEduActionText(valor).replace(/^[.:;,-]+|[.;:,]+$/g, '').trim()
  if (!limpo) return ''
  return limpo.length > MAX_LENGTH ? `${limpo.slice(0, MAX_LENGTH - 3).trim()}...` : limpo
}

/**
 * Propostas confirmáveis a partir do briefing.
 *
 * `next_steps` é a fonte natural — é literalmente "próximos passos". As
 * `priorities` entram **só quando parecem ação**: uma prioridade costuma ser
 * diagnóstico ("água abaixo do mínimo"), e transformar diagnóstico em tarefa
 * produziria itens que ninguém consegue executar nem marcar como feitos.
 *
 * `strengths` nunca entra. É o que já está bom.
 */
export function buildBriefingProposals(source: BriefingSource): BriefingProposal[] {
  const candidatos: Array<{ name: string; from: BriefingProposal['from'] }> = []

  for (const linha of source.next_steps ?? []) {
    const nome = normalizar(String(linha ?? ''))
    if (nome.length >= 8 && carregaProprioContexto(nome)) candidatos.push({ name: nome, from: 'next_steps' })
  }

  for (const linha of source.priorities ?? []) {
    const nome = normalizar(String(linha ?? ''))
    if (nome.length >= 8 && looksActionable(nome) && carregaProprioContexto(nome)) {
      candidatos.push({ name: nome, from: 'priorities' })
    }
  }

  /*
   * Deduplicação por texto normalizado. O modelo repete a mesma ideia entre
   * prioridades e próximos passos com frequência, e duas linhas iguais na tela
   * viram duas linhas iguais no checklist — a duplicata que esta frente inteira
   * vem consertando.
   */
  const vistos = new Set<string>()
  const unicos = candidatos.filter(({ name }) => {
    const chave = name.toLowerCase()
    if (vistos.has(chave)) return false
    vistos.add(chave)
    return true
  })

  return unicos.slice(0, MAX_PROPOSTAS).map(({ name, from }) => ({
    name,
    tier: 'ESSENTIAL' as ChecklistTier,
    quantity: 1,
    unit: null,
    from,
  }))
}

/**
 * O `kit_type` com que a proposta confirmada é gravada.
 *
 * `PILOT_RECOMMENDATION`, e não um valor novo. O briefing é interpretação de
 * IA sobre o estado da família — que é a definição do Pilot em `docs/37` §8. Um
 * valor novo exigiria migração para ampliar o CHECK de `provenance`, e criaria
 * uma sexta procedência para distinguir dois lugares onde o MESMO raciocínio
 * acontece.
 *
 * A distinção entre conversa e briefing é trabalho de `provenance_ref`, coluna
 * que `requirements` já tem (D-161) e que passa a valer no cutover.
 */
export const BRIEFING_KIT_TYPE = 'PILOT_RECOMMENDATION'
