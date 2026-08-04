import type { SupabaseClient } from '@supabase/supabase-js'
import { createCommsNotifications } from '@/lib/comms-notifications'
import { sendPush } from '@/lib/push'

/**
 * Quantas ocorrências desde o último aviso já merecem um aviso mesmo sem
 * defeito novo. Sem esta trava, um defeito CONHECIDO que passasse a disparar
 * dez mil vezes por hora não geraria som nenhum — e uma regressão em massa é
 * justamente a hora em que se precisa saber.
 */
const VOLUME_QUE_GRITA = 50

/** Quantos erros a varredura olha por rodada. Alto o bastante para uma
 *  tempestade, baixo o bastante para o cron não travar nisso. */
const TETO_VARREDURA = 500

type Grupo = { fp: string; scope: string; message: string; total: number }

/**
 * Avisa o dono quando aparece DEFEITO novo (D-119, reescrito no D-121).
 *
 * A primeira versão avisava por ocorrência, e isso não escala: um defeito que
 * dispara em laço geraria um aviso a cada quinze minutos dizendo a mesma coisa,
 * até você desligar a notificação — e desligar o aviso é como se perde a
 * visibilidade que ele existia para dar.
 *
 * Com o agrupamento do D-121, o critério passa a ser o que o Sentry chama de
 * *new issue*: **avisa quando aparece uma impressão digital que nunca foi
 * vista**. Cem ocorrências do mesmo defeito são um aviso; um defeito novo entre
 * elas é outro.
 *
 * A MARCA D'ÁGUA É A PRÓPRIA NOTIFICAÇÃO ANTERIOR: guardar "até onde já avisei"
 * exigiria coluna nova, e a última notificação enviada já responde exatamente
 * essa pergunta. Se o envio falhar, a marca não avança e a próxima rodada tenta
 * de novo — nada se perde em silêncio.
 *
 * E QUANDO NÃO AVISA, DIZ QUE NÃO AVISOU. A resposta sempre traz a contagem,
 * mesmo em silêncio. "Nada aconteceu" e "aconteceu e eu decidi não te acordar"
 * são coisas diferentes, e confundi-las é o defeito que este projeto mais
 * repetiu.
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

  const { data: recentes, error } = await admin
    .from('error_log')
    .select('scope, message, context, created_at')
    .gt('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(TETO_VARREDURA)

  if (error) return `erro: ${error.message}`
  const linhas = (recentes ?? []) as Array<{ scope: string; message: string; context: { fp?: string } | null }>
  if (!linhas.length) return 'sem erro novo'

  // Agrupa. Linha gravada antes do D-121 não tem impressão digital; ela cai num
  // grupo por escopo, o que é pior que o ideal e melhor que ser descartada.
  const grupos = new Map<string, Grupo>()
  for (const l of linhas) {
    const fp = l.context?.fp ?? `legado:${l.scope}`
    const g = grupos.get(fp)
    if (g) g.total += 1
    else grupos.set(fp, { fp, scope: l.scope, message: l.message, total: 1 })
  }

  // Quais dessas impressões digitais o app JÁ tinha visto antes desta janela?
  // O que sobra é defeito novo — e é só isso que justifica acordar alguém.
  const fps = Array.from(grupos.keys()).filter(fp => !fp.startsWith('legado:'))
  let conhecidos = new Set<string>()
  if (fps.length) {
    const { data: antigos } = await admin
      .from('error_log')
      .select('context')
      .lte('created_at', desde)
      .in('context->>fp', fps)
      .limit(TETO_VARREDURA)
    conhecidos = new Set(
      ((antigos ?? []) as Array<{ context: { fp?: string } | null }>)
        .map(a => a.context?.fp)
        .filter((x): x is string => Boolean(x)),
    )
  }

  const novos = Array.from(grupos.values()).filter(g => !conhecidos.has(g.fp))
  const total = linhas.length
  const resumo = { ocorrencias: total, grupos: grupos.size, defeitosNovos: novos.length }

  const porVolume = novos.length === 0 && total >= VOLUME_QUE_GRITA
  if (!novos.length && !porVolume) {
    // Silêncio DECLARADO: houve erro, mas nenhum defeito novo e nenhum volume
    // fora do normal. Quem lê a resposta do cron vê que a decisão foi tomada.
    return { ...resumo, avisou: false, motivo: 'nenhum defeito novo' }
  }

  const destaque = (novos.length ? novos : Array.from(grupos.values())).sort((a, b) => b.total - a.total)[0]
  const titulo = porVolume
    ? `${total} erros desde o último aviso`
    : novos.length === 1
      ? '1 defeito novo no EOS'
      : `${novos.length} defeitos novos no EOS`
  const corpo = `${destaque.scope} — ${destaque.message.slice(0, 90)}${destaque.total > 1 ? ` (${destaque.total}×)` : ''}`

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
  return { ...resumo, avisou: true, motivo: porVolume ? 'volume' : 'defeito novo', push }
}
