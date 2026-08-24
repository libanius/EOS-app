/**
 * Amortecimento do laço (PREP-T09 / D-170).
 *
 * ── O problema que aparece quando o laço fecha ────────────────────────────
 *
 * O laço de `docs/37` fecha em si mesmo: estado muda → gatilho → proposta →
 * o usuário confirma → estado muda → gatilho de novo. Sem amortecimento ele
 * oscila, e num app de emergência isso vira insistência sobre a mesma coisa —
 * a forma mais rápida de ensinar alguém a ignorar o app.
 *
 * Dois vazamentos concretos existiam:
 *
 * **1. A proposta se reoferecia depois de recarregar.** O "✓ na lista" vivia em
 * estado de componente. Fechou a aba, voltou, e o botão "Adicionar" estava lá
 * de novo para um item que já estava na lista. O banco não duplicava
 * (`ignoreDuplicates`), mas a tela pedia o mesmo toque duas vezes — e um app
 * que pede duas vezes a mesma coisa parece quebrado, mesmo quando não está.
 *
 * **2. A faixa do alerta voltava sozinha.** Não havia como dizer "já vi".
 *
 * ── O que NÃO foi construído, de propósito ────────────────────────────────
 *
 * `docs/37` §13 prevê `ReadinessAssessment` como tabela. Ela **não** foi criada
 * aqui: hoje nada a leria. O cron manda notificação por conta própria, e o
 * amortecimento que importa acontece na tela, com o usuário presente. Criar
 * tabela sem consumidor é exatamente o que o §35 manda evitar — ela entra
 * quando existir quem consulte, provavelmente junto do orçamento de
 * interrupção por push.
 */

import { canonicalKey } from '@/lib/checklist'

/**
 * Este item já está na lista?
 *
 * Compara por `canonical_key`, e **não por texto**: é a mesma chave que o
 * servidor calcula ao gravar (`/api/checklist/save-items`). Comparar o texto
 * exibido erraria em acento, maiúscula e pontuação — e erraria justamente para
 * mais, reoferecendo o que já existe.
 */
export function alreadyOnList(
  name: string,
  rows: Array<{ canonical_key: string }>,
): boolean {
  const chave = canonicalKey(name)
  if (!chave) return false
  return rows.some(row => row.canonical_key === chave)
}

/**
 * Chave de dispensa de um gatilho.
 *
 * Dispensar é durável e vale para AQUELE gatilho. Um alerta novo — outro
 * evento, outra severidade, outra validade — tem chave diferente e volta a
 * aparecer. É o comportamento certo: "já vi este aviso" não pode significar
 * "não me avise mais".
 */
export function dismissalKey(triggerKey: string): string {
  return `eos-reassessment-dismissed:${triggerKey}`
}

/**
 * A reavaliação deve aparecer?
 *
 * `dismissed` é a lista de chaves já dispensadas neste aparelho.
 *
 * Dispensa mora no aparelho de propósito: é uma preferência de exibição, não um
 * fato sobre a casa. Sincronizá-la exigiria tabela e traria a pergunta difícil
 * de o que fazer quando um membro dispensa e outro não — e "não me mostre" de
 * uma pessoa não pode calar o aviso para a família inteira.
 */
export function shouldShowReassessment(
  triggerKey: string | null,
  dismissed: ReadonlyArray<string>,
): boolean {
  if (!triggerKey) return false
  return !dismissed.includes(dismissalKey(triggerKey))
}
