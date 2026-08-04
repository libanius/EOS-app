/**
 * Agrupamento automático de erro (D-121).
 *
 * É a única coisa que o Sentry fazia e o `error_log` não: quinhentas
 * ocorrências do mesmo defeito são UM defeito, e listá-las uma a uma esconde
 * exatamente o que interessa — que existem outros três defeitos embaixo delas.
 *
 * A ideia é velha e simples: reduzir cada erro a uma **impressão digital** que
 * ignora o que muda entre duas ocorrências e preserva o que as torna o mesmo
 * problema. `Usuário 481 não encontrado` e `Usuário 902 não encontrado` são o
 * mesmo defeito; `Usuário 481 não encontrado` e `Conexão recusada` não são.
 *
 * ONDE ELA MORA. Dentro do `context`, não em coluna nova. Uma coluna pediria
 * outra migration e mais uma ação do dono; o `jsonb` já está lá e o volume é
 * pequeno. Se um dia a tabela crescer a ponto de a varredura pesar, promover
 * `fp` a coluna indexada é uma migration de três linhas — e aí ela se paga.
 */

import { createHash } from 'node:crypto'

/**
 * O que varia entre duas ocorrências do MESMO defeito, e portanto tem que sair
 * antes de comparar.
 *
 * A ordem importa: identificadores e endereços primeiro, números soltos por
 * último — senão o `<n>` come os dígitos de dentro de um UUID e o agrupamento
 * fica largo demais, juntando defeitos diferentes.
 */
const VARIAVEIS: Array<[RegExp, string]> = [
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>'],
  [/\bhttps?:\/\/[^\s"')]+/gi, '<url>'],
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/gi, '<email>'],
  [/\b[0-9a-f]{16,}\b/gi, '<hash>'],
  [/"[^"]*"|'[^']*'/g, '<s>'],
  // Número COM unidade colada vem antes do número solto: em `30000ms` não há
  // fronteira de palavra entre o dígito e o `ms`, então a regra genérica passa
  // batido e `timeout after 30000ms` viraria um grupo por duração. O teste
  // unitário pegou exatamente isso.
  [/\b\d+(\.\d+)?(ms|s|m|h|kb|mb|gb|px|em|rem|%)\b/gi, '<n>'],
  [/\b\d+(\.\d+)?\b/g, '<n>'],
]

/** Deixa só o que é estrutural na mensagem. */
export function normalizarMensagem(mensagem: string): string {
  let saida = mensagem.toLowerCase()
  for (const [de, para] of VARIAVEIS) saida = saida.replace(de, para)
  return saida.replace(/\s+/g, ' ').trim().slice(0, 300)
}

/**
 * A primeira linha da pilha que é código nosso.
 *
 * Sem ela, dois erros com a mesma frase genérica (`Failed to fetch`) vindos de
 * lugares diferentes viram um grupo só, e o agrupamento passa a esconder em vez
 * de organizar. O número da linha é descartado de propósito: ele muda a cada
 * build e transformaria o mesmo defeito em um grupo novo por versão.
 */
function quadroRelevante(pilha: string | null | undefined): string {
  if (!pilha) return ''
  for (const linha of pilha.split('\n').slice(1)) {
    if (/node_modules|node:internal|<anonymous>/.test(linha)) continue
    const m = linha.match(/\(?([^\s()]+?\.(?:tsx?|jsx?|mjs))(?::\d+:\d+)?\)?/)
    if (m) return m[1].replace(/^.*?(?=\/(?:app|lib|components)\/)/, '')
  }
  return ''
}

/**
 * A impressão digital: escopo + mensagem normalizada + de onde veio.
 *
 * Doze caracteres de SHA-256 dão espaço de sobra para os grupos que um app
 * deste tamanho produz, e cabem numa tela sem quebrar a linha.
 */
export function fingerprint(scope: string, mensagem: string, pilha?: string | null): string {
  const base = `${scope}|${normalizarMensagem(mensagem)}|${quadroRelevante(pilha)}`
  return createHash('sha256').update(base).digest('hex').slice(0, 12)
}
