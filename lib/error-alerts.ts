import type { SupabaseClient } from '@supabase/supabase-js'
import { createCommsNotifications } from '@/lib/comms-notifications'
import { sendPush } from '@/lib/push'

/**
 * Avisa o dono quando aparece erro novo (D-119, passo 2).
 *
 * O `error_log` do D-118 só resolve metade: um registro que depende de alguém
 * lembrar de consultar continua meio invisível. O que transforma "dá para
 * descobrir" em "eu fico sabendo" é a notificação chegar sozinha.
 *
 * Vai de carona neste cron porque ele já roda de quinze em quinze minutos e já
 * tem o segredo — nenhum agendador novo para configurar e para esquecer.
 *
 * A MARCA D'ÁGUA É A PRÓPRIA NOTIFICAÇÃO ANTERIOR, e isso é de propósito:
 * guardar "até onde já avisei" exigiria coluna nova, e a última notificação
 * enviada já responde exatamente essa pergunta. Se o envio falhar, a marca não
 * avança e a próxima rodada tenta de novo — nada se perde em silêncio.
 */
export async function avisarErrosNovos(admin: SupabaseClient) {
  const donos = (process.env.ERROR_ALERT_USER_IDS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  if (!donos.length) return 'not_configured'

  const { data: ultimo } = await admin
    .from('circle_notifications')
    .select('created_at')
    .eq('kind', 'error_alert')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Na primeira execução não há marca: olha as últimas 24h em vez do histórico
  // inteiro, senão o primeiro aviso seria um despejo sem utilidade.
  const desde = (ultimo?.created_at as string | undefined) ?? new Date(Date.now() - 86_400_000).toISOString()

  const { data: novos, error } = await admin
    .from('error_log')
    .select('scope, message, created_at')
    .gt('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return `erro: ${error.message}`
  const linhas = (novos ?? []) as Array<{ scope: string; message: string }>
  if (!linhas.length) return 'sem erro novo'

  const lugares = Array.from(new Set(linhas.map(l => l.scope)))
  const titulo = linhas.length === 1 ? '1 erro novo no EOS' : `${linhas.length} erros novos no EOS`
  const corpo = `${lugares.slice(0, 3).join(', ')}${lugares.length > 3 ? '…' : ''} — ${linhas[0].message.slice(0, 100)}`

  await createCommsNotifications({
    admin,
    recipientIds: donos,
    scope: 'system',
    surface: 'system',
    kind: 'error_alert',
    title: titulo,
    body: corpo,
    href: '/dashboard',
    severity: 'high',
    excludeActor: false,
  })

  const push = await sendPush(admin, donos, { title: `EOS · ${titulo}`, body: corpo, url: '/dashboard' })
  return { novos: linhas.length, lugares: lugares.length, push }
}
