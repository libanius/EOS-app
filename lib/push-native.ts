/**
 * Envio de push para aparelhos nativos — APNs e FCM (D-228 §3).
 *
 * ── Por que não há SDK aqui ────────────────────────────────────────────────
 *
 * Nem `firebase-admin`, nem biblioteca de APNs. Os dois protocolos cabem em
 * `node:crypto` e `node:http2`, e o que se evita com isso não é peso de bundle:
 *
 *  · `firebase-admin` no iOS obrigaria o Firebase a entrar no caminho de uma
 *    notificação de iPhone. A `docs/38` §1.5 enumera cada terceiro que recebe
 *    dado das famílias, e essa lista é curta de propósito. Com APNs direto, o
 *    token vai para a Apple e para mais ninguém;
 *  · um SDK que abre conexão sozinho e guarda estado global é a última coisa que
 *    se quer dentro de uma função serverless.
 *
 * O custo são duas implementações de JWT — ES256 para a Apple, RS256 para o
 * Google. Ambas abaixo, ambas cobertas por teste.
 *
 * ── A regra que governa este arquivo ──────────────────────────────────────
 *
 * **Apagar um token exige certeza, não suspeita.**
 *
 * Um erro de configuração — chave errada, ambiente trocado, projeto errado —
 * faz TODOS os aparelhos falharem ao mesmo tempo. Se falha virasse remoção,
 * um `APNS_ENVIRONMENT` errado apagaria a base inteira de iPhones num deploy, e
 * a recuperação exigiria cada família reabrir o app. Então só se remove diante
 * de sinal inequívoco de que o token deixou de existir; qualquer outra coisa
 * conta como falha e a linha permanece.
 */

import crypto from 'node:crypto'
import http2 from 'node:http2'

export type NativePushPayload = { title: string; body: string; url?: string }

export type NativeDevice = { token: string; platform: 'ios' | 'android' }

export type NativeSendOutcome = {
  token: string
  platform: 'ios' | 'android'
  ok: boolean
  /** `true` só quando o provedor afirmou que este token não existe mais. */
  dead: boolean
  reason?: string
}

export type NativeSendResult = {
  sent: number
  failed: number
  dead: string[]
  /** Plataformas sem credencial configurada — o app roda, o push não sai. */
  notConfigured: Array<'ios' | 'android'>
}

// ─── Base64url ──────────────────────────────────────────────────────────────

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Chaves PEM vindas de variável de ambiente chegam de duas formas.
 *
 * Na Vercel, colar um `.p8` no formulário preserva as quebras de linha reais;
 * colar o `private_key` de um JSON de service account traz `\n` LITERAL, duas
 * letras. Um PEM com `\n` literal não é PEM — `crypto` recusa com uma mensagem
 * que não menciona isso, e a única pista é o push parar de sair.
 */
export function normalizarPem(valor: string): string {
  return valor.includes('\\n') ? valor.replace(/\\n/g, '\n') : valor
}

// ─── Configuração ───────────────────────────────────────────────────────────

export type ApnsConfig = {
  keyP8: string
  keyId: string
  teamId: string
  bundleId: string
  host: string
}

export type FcmConfig = {
  projectId: string
  clientEmail: string
  privateKey: string
}

const APNS_PROD = 'api.push.apple.com'
const APNS_SANDBOX = 'api.sandbox.push.apple.com'

/**
 * O ambiente decide o HOST, e errar aqui não dá erro legível.
 *
 * Um token emitido em desenvolvimento recusado pelo host de produção volta como
 * `BadDeviceToken` — a mesma resposta de um token de verdade inválido. É o
 * motivo de `BadDeviceToken` NÃO remover nada nesta implementação: as duas
 * causas são indistinguíveis pela resposta, e uma delas é um erro de deploy.
 */
export function apnsConfig(env: Record<string, string | undefined> = process.env): ApnsConfig | null {
  const keyP8 = env.APNS_KEY_P8
  const keyId = env.APNS_KEY_ID
  const teamId = env.APNS_TEAM_ID
  const bundleId = env.APNS_BUNDLE_ID
  if (!keyP8 || !keyId || !teamId || !bundleId) return null
  return {
    keyP8: normalizarPem(keyP8),
    keyId,
    teamId,
    bundleId,
    host: env.APNS_ENVIRONMENT === 'sandbox' ? APNS_SANDBOX : APNS_PROD,
  }
}

export function fcmConfig(env: Record<string, string | undefined> = process.env): FcmConfig | null {
  const bruto = env.FCM_SERVICE_ACCOUNT_JSON
  if (!bruto) return null
  try {
    const j = JSON.parse(bruto) as { project_id?: string; client_email?: string; private_key?: string }
    if (!j.project_id || !j.client_email || !j.private_key) return null
    return {
      projectId: j.project_id,
      clientEmail: j.client_email,
      privateKey: normalizarPem(j.private_key),
    }
  } catch {
    return null
  }
}

// ─── JWT ────────────────────────────────────────────────────────────────────

/**
 * JWT ES256 para a APNs.
 *
 * A assinatura precisa sair no formato JOSE — `r || s`, 64 bytes crus. O padrão
 * do Node para chave EC é DER, que a Apple rejeita como token malformado sem
 * dizer o motivo. `dsaEncoding: 'ieee-p1363'` é o que pede o formato certo.
 */
export function assinarApnsJwt(cfg: ApnsConfig, agoraSeg: number): string {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId, typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: agoraSeg }))
  const corpo = `${header}.${claims}`
  const assinatura = crypto.sign('sha256', Buffer.from(corpo), {
    key: cfg.keyP8,
    dsaEncoding: 'ieee-p1363',
  })
  return `${corpo}.${b64url(assinatura)}`
}

/** JWT RS256 que o Google troca por um access token. */
export function assinarFcmJwt(cfg: FcmConfig, agoraSeg: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      iss: cfg.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: agoraSeg,
      exp: agoraSeg + 3600,
    }),
  )
  const corpo = `${header}.${claims}`
  const assinatura = crypto.sign('sha256', Buffer.from(corpo), cfg.privateKey)
  return `${corpo}.${b64url(assinatura)}`
}

/*
 * Cache de credencial.
 *
 * A Apple pede que o JWT seja REUTILIZADO — reemitir a cada envio devolve
 * `TooManyProviderTokenUpdates` e derruba o provedor. O token do Google vale uma
 * hora e trocá-lo por envio seria uma ida extra à rede em cada notificação.
 *
 * Em serverless o processo pode ser novo a cada chamada; quando é reaproveitado,
 * isto vale. Nos dois casos está correto.
 */
let apnsJwtCache: { valor: string; emitidoEm: number } | null = null
let fcmTokenCache: { valor: string; expiraEm: number } | null = null

/** Exposto para teste: um cache sujo faria um teste mentir sobre o outro. */
export function limparCacheDeCredenciais(): void {
  apnsJwtCache = null
  fcmTokenCache = null
}

const APNS_JWT_VIDA_SEG = 45 * 60 // A Apple recusa acima de 60 min.

function apnsJwt(cfg: ApnsConfig, agoraSeg: number): string {
  if (apnsJwtCache && agoraSeg - apnsJwtCache.emitidoEm < APNS_JWT_VIDA_SEG) {
    return apnsJwtCache.valor
  }
  const valor = assinarApnsJwt(cfg, agoraSeg)
  apnsJwtCache = { valor, emitidoEm: agoraSeg }
  return valor
}

async function fcmAccessToken(cfg: FcmConfig): Promise<string | null> {
  const agoraSeg = Math.floor(Date.now() / 1000)
  if (fcmTokenCache && fcmTokenCache.expiraEm > agoraSeg + 60) return fcmTokenCache.valor

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assinarFcmJwt(cfg, agoraSeg),
    }),
  })
  if (!res.ok) {
    console.error('[EOS] troca de token do FCM falhou:', res.status, await res.text().catch(() => ''))
    return null
  }
  const j = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!j.access_token) return null
  fcmTokenCache = { valor: j.access_token, expiraEm: agoraSeg + (j.expires_in ?? 3600) }
  return j.access_token
}

// ─── Formato das mensagens (puro, testável) ─────────────────────────────────

export function montarApnsPayload(p: NativePushPayload): Record<string, unknown> {
  return {
    aps: {
      alert: { title: p.title, body: p.body },
      sound: 'default',
      /*
       * `mutable-content` deixa a extensão de notificação enriquecer o alerta
       * antes de ele aparecer. Ainda não há extensão; a chave fica porque
       * adicioná-la depois exigiria republicar o app para alcançar quem já
       * instalou — e a chave sozinha não muda nada hoje.
       */
      'mutable-content': 1,
    },
    url: p.url ?? '/dashboard',
  }
}

export function montarFcmMensagem(token: string, p: NativePushPayload): Record<string, unknown> {
  return {
    message: {
      token,
      notification: { title: p.title, body: p.body },
      /*
       * `data` só aceita string no FCM v1. Um número aqui devolve
       * `INVALID_ARGUMENT` para a mensagem inteira.
       */
      data: { url: p.url ?? '/dashboard' },
      android: {
        priority: 'HIGH',
        notification: {
          /*
           * Precisa existir no aparelho ANTES da primeira mensagem — criado em
           * `MainActivity.criarCanalDeAlertas()`. Canal inexistente faz o
           * Android 8+ DESCARTAR a notificação em silêncio: o servidor relata
           * sucesso e o telefone nunca toca.
           */
          channel_id: 'eos_alerts',
          default_sound: true,
        },
      },
    },
  }
}

// ─── Quem está morto de verdade ─────────────────────────────────────────────

/**
 * Só `Unregistered` (410). E só.
 *
 * `BadDeviceToken` fica de fora de propósito: a APNs devolve exatamente esse
 * motivo quando o token é de outro AMBIENTE — um build de desenvolvimento
 * conversando com o host de produção. Como as duas causas são indistinguíveis
 * pela resposta, tratar isso como morte transformaria um `APNS_ENVIRONMENT`
 * trocado num deploy que apaga todos os iPhones da base.
 */
export function apnsTokenMorreu(status: number, reason: string | undefined): boolean {
  return status === 410 || reason === 'Unregistered'
}

/**
 * Só `UNREGISTERED` (404).
 *
 * `INVALID_ARGUMENT` (400) fica de fora pelo mesmo motivo: o FCM o usa tanto
 * para token inválido quanto para payload malformado, e um payload quebrado é
 * defeito nosso que atingiria todos os aparelhos de uma vez.
 * `SENDER_ID_MISMATCH` (403) também fica: significa projeto Firebase errado,
 * outro erro de configuração.
 */
export function fcmTokenMorreu(status: number, corpo: unknown): boolean {
  if (status === 404) return true
  const status2 = (corpo as { error?: { status?: string } } | null)?.error?.status
  return status2 === 'UNREGISTERED' || status2 === 'NOT_FOUND'
}

// ─── APNs ───────────────────────────────────────────────────────────────────

async function enviarApns(
  tokens: string[],
  payload: NativePushPayload,
  cfg: ApnsConfig,
): Promise<NativeSendOutcome[]> {
  if (!tokens.length) return []

  const jwt = apnsJwt(cfg, Math.floor(Date.now() / 1000))
  const corpo = JSON.stringify(montarApnsPayload(payload))

  /*
   * Uma conexão HTTP/2 para todos os tokens.
   *
   * O protocolo é multiplexado: abrir uma conexão por notificação é o
   * antipadrão que a Apple documenta, e com volume ela passa a recusar.
   */
  const sessao = http2.connect(`https://${cfg.host}`)
  const resultados: NativeSendOutcome[] = []

  try {
    await new Promise<void>((resolve, reject) => {
      sessao.once('error', reject)
      sessao.once('connect', () => resolve())
    })

    await Promise.all(
      tokens.map(
        token =>
          new Promise<void>(resolve => {
            const req = sessao.request({
              ':method': 'POST',
              ':path': `/3/device/${token}`,
              authorization: `bearer ${jwt}`,
              'apns-topic': cfg.bundleId,
              'apns-push-type': 'alert',
              /*
               * Prioridade 10 = entregar agora. Um alerta de perigo agrupado
               * pelo sistema para poupar bateria chega tarde, e tarde aqui é
               * igual a não chegar.
               */
              'apns-priority': '10',
              /*
               * Vale uma hora. Passou disso, a informação envelheceu: acordar
               * alguém às 3h com um aviso de perigo que já passou destrói a
               * confiança em todos os avisos seguintes.
               */
              'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
              'content-type': 'application/json',
            })

            let status = 0
            let resposta = ''
            req.on('response', h => {
              status = Number(h[':status'] ?? 0)
            })
            req.setEncoding('utf8')
            req.on('data', c => {
              resposta += c
            })
            req.on('error', e => {
              resultados.push({
                token,
                platform: 'ios',
                ok: false,
                dead: false,
                reason: e instanceof Error ? e.message : 'stream error',
              })
              resolve()
            })
            req.on('end', () => {
              let reason: string | undefined
              if (resposta) {
                try {
                  reason = (JSON.parse(resposta) as { reason?: string }).reason
                } catch {
                  /* corpo não-JSON: o status ainda decide */
                }
              }
              const ok = status === 200
              resultados.push({
                token,
                platform: 'ios',
                ok,
                dead: !ok && apnsTokenMorreu(status, reason),
                reason: ok ? undefined : (reason ?? `HTTP ${status}`),
              })
              resolve()
            })

            req.end(corpo)
          }),
      ),
    )
  } catch (e) {
    // A conexão não subiu: NENHUM token é culpado disso.
    const motivo = e instanceof Error ? e.message : 'apns connect failed'
    for (const token of tokens) {
      if (!resultados.some(r => r.token === token)) {
        resultados.push({ token, platform: 'ios', ok: false, dead: false, reason: motivo })
      }
    }
  } finally {
    sessao.close()
  }

  return resultados
}

// ─── FCM ────────────────────────────────────────────────────────────────────

async function enviarFcm(
  tokens: string[],
  payload: NativePushPayload,
  cfg: FcmConfig,
): Promise<NativeSendOutcome[]> {
  if (!tokens.length) return []

  const access = await fcmAccessToken(cfg)
  if (!access) {
    return tokens.map(token => ({
      token,
      platform: 'android' as const,
      ok: false,
      dead: false,
      reason: 'fcm_auth_failed',
    }))
  }

  const url = `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`

  return Promise.all(
    tokens.map(async token => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(montarFcmMensagem(token, payload)),
        })
        if (res.ok) return { token, platform: 'android' as const, ok: true, dead: false }
        const corpo = await res.json().catch(() => null)
        const reason =
          (corpo as { error?: { status?: string; message?: string } } | null)?.error?.status ??
          `HTTP ${res.status}`
        return {
          token,
          platform: 'android' as const,
          ok: false,
          dead: fcmTokenMorreu(res.status, corpo),
          reason,
        }
      } catch (e) {
        return {
          token,
          platform: 'android' as const,
          ok: false,
          dead: false,
          reason: e instanceof Error ? e.message : 'fetch failed',
        }
      }
    }),
  )
}

// ─── Porta única ────────────────────────────────────────────────────────────

/**
 * Envia para aparelhos nativos e diz exatamente o que aconteceu.
 *
 * Nunca lança: `sendPush()` a chama junto do Web Push, e uma exceção aqui
 * derrubaria o envio para o navegador junto — o oposto do que se quer quando um
 * dos dois transportes está com problema.
 */
export async function enviarParaAparelhos(
  devices: NativeDevice[],
  payload: NativePushPayload,
): Promise<NativeSendResult> {
  const vazio: NativeSendResult = { sent: 0, failed: 0, dead: [], notConfigured: [] }
  if (!devices.length) return vazio

  const ios = devices.filter(d => d.platform === 'ios').map(d => d.token)
  const android = devices.filter(d => d.platform === 'android').map(d => d.token)

  const apns = ios.length ? apnsConfig() : null
  const fcm = android.length ? fcmConfig() : null

  const notConfigured: Array<'ios' | 'android'> = []
  if (ios.length && !apns) notConfigured.push('ios')
  if (android.length && !fcm) notConfigured.push('android')

  const [rIos, rAndroid] = await Promise.all([
    apns ? enviarApns(ios, payload, apns).catch(() => [] as NativeSendOutcome[]) : Promise.resolve([]),
    fcm ? enviarFcm(android, payload, fcm).catch(() => [] as NativeSendOutcome[]) : Promise.resolve([]),
  ])

  const todos = [...rIos, ...rAndroid]

  /*
   * Aparelho de plataforma sem credencial conta como FALHA, não some da conta.
   *
   * A D-119 escreveu `sendPush` para que "não enviei" nunca se confunda com
   * "enviei". Omitir estes daria um relatório de zero falhas com metade da base
   * sem receber nada.
   */
  const semCredencial = (apns ? 0 : ios.length) + (fcm ? 0 : android.length)

  return {
    sent: todos.filter(r => r.ok).length,
    failed: todos.filter(r => !r.ok).length + semCredencial,
    dead: todos.filter(r => r.dead).map(r => r.token),
    notConfigured,
  }
}
