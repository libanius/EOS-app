/**
 * Autenticação do pipeline de conteúdo (CONTENT-001 D-P1, §5.10).
 *
 * Mesmo padrão do cron (`Authorization: Bearer <segredo>`), com segredo próprio:
 * vazado, troca só ele. Sem segredo no servidor, a porta fica fechada (E12).
 */

import { timingSafeEqual } from 'crypto'

export type PipelineAuth = { ok: true; scope: 'full' | 'review' } | { ok: false; status: 401 | 503; error: string }

function matches(given: string, expected: string | undefined): boolean {
  if (!given || !expected) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function authorizePipeline(headers: Headers): PipelineAuth {
  const secret = process.env.CONTENT_PIPELINE_SECRET?.trim()
  const agentSecret = process.env.CONTENT_PIPELINE_AGENT_SECRET?.trim()
  if (!secret && !agentSecret) return { ok: false, status: 503, error: 'pipeline desligado: credencial de conteúdo não configurada' }
  const header = headers.get('authorization') ?? ''
  const given = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  // A credencial de entrega nunca ganha permissão de arquivo, mesmo se as
  // duas variáveis forem configuradas com o mesmo valor por engano.
  const agentMatches = matches(given, agentSecret)
  const fullMatches = matches(given, secret)
  if (agentMatches) return { ok: true, scope: 'review' }
  if (fullMatches) return { ok: true, scope: 'full' }
  return { ok: false, status: 401, error: 'não autorizado' }
}
