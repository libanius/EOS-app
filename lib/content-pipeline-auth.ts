/**
 * Autenticação do pipeline de conteúdo (CONTENT-001 D-P1, §5.10).
 *
 * Mesmo padrão do cron (`Authorization: Bearer <segredo>`), com segredo próprio:
 * vazado, troca só ele. Sem segredo no servidor, a porta fica fechada (E12).
 */

import { timingSafeEqual } from 'crypto'

export type PipelineAuth = { ok: true } | { ok: false; status: 401 | 503; error: string }

export function authorizePipeline(headers: Headers): PipelineAuth {
  const secret = process.env.CONTENT_PIPELINE_SECRET?.trim()
  if (!secret) return { ok: false, status: 503, error: 'pipeline desligado: CONTENT_PIPELINE_SECRET não configurado' }
  const header = headers.get('authorization') ?? ''
  const given = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, status: 401, error: 'não autorizado' }
  return { ok: true }
}
