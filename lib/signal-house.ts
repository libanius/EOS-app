/**
 * "Marcar como tenho" — a parte pura (SIGNAL-002 §4.5).
 *
 * Sem banco e sem rede: as rotas montam as linhas e chamam estas funções. Ficam
 * aqui as três regras fáceis de errar:
 *
 * 1. a casa responde junto, e a resposta mais recente vale (D-M1, §3.4);
 * 2. toda resposta do usuário passa pela tabela de transições, por `needed`
 *    quando o caminho direto não existe (§5.4);
 * 3. só itens de ter ou não ter, de um Sinal no ar, aceitam resposta (§4.3).
 */

import { canTransition, type AcquisitionStatus } from './acquisition'
import type { Provenance } from './requirements'
import type { ProtocolItem, Signal } from './signals'

export type HouseAnswer = 'have' | 'need' | 'not_applicable'
export const HOUSE_ANSWERS: HouseAnswer[] = ['have', 'need', 'not_applicable']

const STATUS_BY_ANSWER: Record<HouseAnswer, AcquisitionStatus> = {
  have: 'met',
  need: 'needed',
  not_applicable: 'not_applicable',
}

export function answerToStatus(answer: HouseAnswer): AcquisitionStatus {
  return STATUS_BY_ANSWER[answer]
}

/** O inverso, para a folha mostrar a resposta atual; `proposed` não é resposta. */
export function statusToAnswer(status: AcquisitionStatus): HouseAnswer | null {
  if (status === 'met') return 'have'
  if (status === 'needed') return 'need'
  if (status === 'not_applicable') return 'not_applicable'
  return null
}

/* ── 1. A casa responde junto ──────────────────────────────────────────── */

export type BaselineRow = {
  profile_id: string
  resource_key: string
  status: AcquisitionStatus
  provenance: Provenance
  updated_at: string
}

export type HouseItemState = {
  status: AcquisitionStatus
  updatedAt: string
  by: { name: string; isMe: boolean }
  provenance: Provenance
}

/**
 * Das linhas de base de todas as contas da casa, a mais recente por recurso.
 * `proposed` fica de fora: é sugestão, não resposta da casa.
 */
export function houseItemStates(
  rows: BaselineRow[],
  names: Map<string, string>,
  me: string,
): Record<string, HouseItemState> {
  const out: Record<string, HouseItemState> = {}
  for (const r of rows) {
    if (r.status === 'proposed') continue
    const atual = out[r.resource_key]
    if (atual && atual.updatedAt >= r.updated_at) continue
    out[r.resource_key] = {
      status: r.status,
      updatedAt: r.updated_at,
      by: { name: names.get(r.profile_id) ?? '', isMe: r.profile_id === me },
      provenance: r.provenance,
    }
  }
  return out
}

/** As chaves que `protocolView()` recebe, calculadas a partir da casa. */
export function houseKeys(states: Record<string, HouseItemState>) {
  const metKeys = new Set<string>()
  const notApplicableKeys = new Set<string>()
  for (const [key, s] of Object.entries(states)) {
    if (s.status === 'met') metKeys.add(key)
    if (s.status === 'not_applicable') notApplicableKeys.add(key)
  }
  return { metKeys, notApplicableKeys }
}

/* ── 2. Transição permitida ────────────────────────────────────────────── */

/**
 * O usuário pode chegar ao estado pedido? Direto, ou passando por `needed`
 * (`met` → `needed` → `not_applicable`; `proposed` → `needed` → `met`).
 * Sem linha anterior, criar é sempre do usuário e sempre permitido.
 */
export function userCanReach(from: AcquisitionStatus | null, to: AcquisitionStatus): boolean {
  if (from === null || from === to) return true
  if (canTransition(from, to, 'user')) return true
  return canTransition(from, 'needed', 'user') && canTransition('needed', to, 'user')
}

/**
 * A gravação é necessária? Só não é quando a minha linha já tem a resposta
 * E a casa também lê essa resposta (toque duplo, E4). Se outra conta respondeu
 * diferente depois de mim, gravar de novo renova o meu `updated_at` e a minha
 * resposta volta a valer (E15).
 */
export function needsWrite(
  from: AcquisitionStatus | null,
  target: AcquisitionStatus,
  houseNow: HouseItemState | undefined,
): boolean {
  if (from !== target) return true
  return !houseNow || houseNow.status !== target || !houseNow.by.isMe
}

/* ── 3. Que item aceita resposta ───────────────────────────────────────── */

export type ItemCheck =
  | { ok: true; item: ProtocolItem }
  | { ok: false; status: 404 | 409 | 422; error: string }

export function checkAnswerable(signal: Signal | null, resourceKey: string): ItemCheck {
  if (!signal) return { ok: false, status: 404, error: 'Sinal não encontrado.' }
  if (signal.status === 'archived') return { ok: false, status: 409, error: 'Sinal arquivado: respostas não são gravadas.' }
  if (signal.status !== 'published') return { ok: false, status: 404, error: 'Sinal não publicado.' }
  const item = signal.protocol.items.find(i => i.resourceKey === resourceKey)
  if (!item) return { ok: false, status: 404, error: 'Este item não faz parte do protocolo.' }
  if (item.kind !== 'PRESENCE') {
    return { ok: false, status: 422, error: 'Água e comida se registram pela quantidade, não por esta resposta.' }
  }
  return { ok: true, item }
}

/** Itens que também gravam a marca antiga do inventário (§3.2). */
export const LEGACY_INVENTORY_FLAG: Record<string, 'has_medical_kit' | 'has_communication_device'> = {
  'kit-medico': 'has_medical_kit',
  'radio-comunicacao': 'has_communication_device',
}
