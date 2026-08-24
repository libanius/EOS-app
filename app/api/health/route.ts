import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sentryConfigured } from '@/lib/error-log'

/**
 * GET /api/health — o que está ligado e o que não está (D-118).
 *
 * Existe porque as duas piores falhas deste projeto foram SILENCIOSAS: o push
 * quebrado por meses e o cron devolvendo 401 desde sempre. Nos dois casos a
 * informação existia no servidor e não havia onde olhar.
 *
 * PROTEGIDA, e por dois motivos.
 *
 * O detalhe não contém segredo, mas é um mapa: "rateLimit unavailable" diz a
 * quem ataca que o endpoint caro está sem teto naquele instante, e "push
 * not_configured" diz onde o produto está cego. Isso é reconhecimento de graça.
 *
 * E a sonda do limitador ESCREVE no banco. Aberta, ela seria um endpoint de
 * escrita sem autenticação — pequeno, mas exatamente o tipo de porta que não se
 * deixa destrancada.
 *
 * Sem o segredo, responde só se o processo está de pé — o suficiente para um
 * monitor de uptime, e nada além disso.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const autorizado = Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`
  if (!autorizado) {
    return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const admin = createAdminClient()

  // Uma escrita real, não um ping: a pergunta é se o limitador FUNCIONA, e um
  // SELECT bem-sucedido não prova que a função existe.
  let rateLimit: 'ok' | 'migration_pending' | 'unavailable' = 'unavailable'
  if (admin) {
    const { error } = await admin.rpc('consume_rate_limit', {
      p_key: 'health:probe',
      p_window: 60,
      p_limit: 1_000_000,
    })
    // PGRST202 = função ausente no cache; 42883 = ausente no Postgres.
    rateLimit = error
      ? (error.code === 'PGRST202' || error.code === '42883' ? 'migration_pending' : 'unavailable')
      : 'ok'
  }

  /**
   * Uma leitura REAL, sem `head`.
   *
   * A primeira versão usava `select(head: true)` e devolveu **`ok` para uma
   * tabela que não existia** — o PostgREST não reclama de um HEAD numa tabela
   * ausente do mesmo jeito. Um verificador de saúde que dá verde no que está
   * quebrado é pior que não ter verificador: ele cria confiança falsa.
   */
  let errorLog: 'ok' | 'migration_pending' | 'unavailable' = 'unavailable'
  if (admin) {
    const { error } = await admin.from('error_log').select('id').limit(1)
    // PGRST205 = tabela ausente no cache do PostgREST; 42P01 = ausente no Postgres.
    errorLog = error
      ? (error.code === 'PGRST205' || error.code === '42P01' ? 'migration_pending' : 'unavailable')
      : 'ok'
  }

  const checks = {
    database: admin ? 'ok' : 'unavailable',
    rateLimit,
    errorLog,
    // Falso não é falha do app; é uma decisão pendente do dono. Mas precisa
    // aparecer, senão volta a ser esquecido.
    sentry: sentryConfigured() ? 'ok' : 'not_configured',
    cronSecret: process.env.CRON_SECRET ? 'ok' : 'not_configured',
    // Sem destinatário, o erro é registrado e ninguém fica sabendo — que é
    // metade do problema que o D-119 existe para resolver.
    errorAlerts: process.env.ERROR_ALERT_USER_IDS ? 'ok' : 'not_configured',
    openai: process.env.OPENAI_API_KEY ? 'ok' : 'not_configured',
    push: process.env.VAPID_PRIVATE_KEY ? 'ok' : 'not_configured',
  }

  const degraded = Object.values(checks).some(v => v !== 'ok')
  return NextResponse.json(
    { status: degraded ? 'degraded' : 'ok', checks, at: new Date().toISOString() },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
