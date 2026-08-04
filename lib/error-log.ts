/**
 * Erro de produção deixa de ser invisível (D-118).
 *
 * O Sentry está no código desde sempre — e **sem DSN em produção**. Ou seja:
 * nenhum erro do servidor era registrado em lugar nenhum. Foi assim que o push
 * ficou meses quebrado sem ninguém saber, e foi assim que a rota do cron passou
 * meses devolvendo 401 em silêncio.
 *
 * Enquanto não houver um DSN, o Postgres que já paga a conta guarda o suficiente
 * para achar um defeito: onde, quando, qual mensagem, qual pilha.
 *
 * O QUE NUNCA ENTRA AQUI: conteúdo de conversa com o Pilot, ficha médica,
 * posição da família, chaves. Um log de erro existe para achar o defeito, não
 * para ler a vida de ninguém — e um log com dado sensível é um vazamento
 * esperando o primeiro acesso indevido.
 */

import { createAdminClient } from '@/lib/supabase/admin'

/** Campos que não podem sair do processo, mesmo por acidente. */
const PROIBIDOS = /(token|secret|key|password|authorization|cookie|ficha|medical|medication|coord|lat|lng)/i

function sanitize(context: Record<string, unknown> | undefined) {
  if (!context) return null
  const limpo: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(context)) {
    if (PROIBIDOS.test(k)) continue
    // Só escalares: um objeto aninhado pode carregar qualquer coisa dentro.
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
      limpo[k] = typeof v === 'string' ? v.slice(0, 300) : v
    }
  }
  return Object.keys(limpo).length ? limpo : null
}

/**
 * Registra e segue. NUNCA lança.
 *
 * Um logger que derruba a rota que estava tentando registrar transforma um erro
 * em dois. Por isso tudo aqui é engolido de propósito — é a única função do
 * projeto onde silêncio é o comportamento certo.
 */
export async function logError(
  scope: string,
  error: unknown,
  extra?: { userId?: string | null; context?: Record<string, unknown> },
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack ?? null : null

  // Sempre no stdout: em desenvolvimento é onde se vê, e na Vercel os logs de
  // função ficam retidos por alguns dias — melhor que nada se o banco falhar.
  console.error(`[EOS:${scope}]`, message)

  try {
    const admin = createAdminClient()
    if (!admin) return
    await admin.from('error_log').insert({
      scope: scope.slice(0, 120),
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 6000) ?? null,
      user_id: extra?.userId ?? null,
      context: sanitize(extra?.context),
    })
  } catch {
    /* Ver o comentário acima: registrar nunca pode ser a causa de uma falha. */
  }
}

/** Está configurado um destino externo de erro? Usado pelo /api/health. */
export function sentryConfigured(): boolean {
  return Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)
}
