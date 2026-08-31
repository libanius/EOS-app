/**
 * Prova que as credenciais de push nativo funcionam — ANTES de confiar nelas.
 *
 * ── Por que este script existe ────────────────────────────────────────────
 *
 * Credencial de push errada não dá erro. Dá silêncio. O app instala, abre,
 * registra o aparelho, e a notificação simplesmente não chega — e quem descobre
 * é uma família que não foi avisada.
 *
 * Pior: as mensagens que a Apple devolve não dizem o que está errado. `403
 * InvalidProviderToken` pode ser Key ID, Team ID ou o próprio `.p8`. `400
 * BadDeviceToken` pode ser ambiente trocado. Sem tradução, cada tentativa é um
 * chute.
 *
 * ── O truque ──────────────────────────────────────────────────────────────
 *
 * Mandamos de propósito para um token que NÃO EXISTE.
 *
 * A Apple e o Google validam a AUTENTICAÇÃO antes de olharem o destinatário.
 * Então "token inválido" é a melhor resposta possível: significa que a chave, o
 * Key ID, o Team ID e o bundle passaram por todas as verificações, e só o
 * destinatário — que inventamos — não existe.
 *
 * Nenhuma notificação é enviada a ninguém. Não há aparelho para receber.
 *
 * Uso:  npm run check:push
 */

import http2 from 'node:http2'
import { config } from 'dotenv'
import { apnsConfig, assinarApnsJwt, assinarFcmJwt, fcmConfig } from '../lib/push-native'

/*
 * Por padrão lê o `.env.local` da máquina.
 *
 * Para conferir o que está DE VERDADE na Vercel — que é o que importa —, puxe
 * para um arquivo À PARTE e aponte para ele:
 *
 *   vercel env pull .env.vercel.local
 *   npm run check:push -- --env .env.vercel.local
 *
 * O arquivo separado não é preciosismo: `vercel env pull .env.local` SOBRESCREVE
 * o seu `.env.local` sem perguntar, e ele guarda chaves que podem não estar na
 * Vercel.
 */
const argEnv = process.argv.indexOf('--env')
const ARQUIVO_ENV = argEnv >= 0 ? process.argv[argEnv + 1] : '.env.local'
config({ path: ARQUIVO_ENV })

/** Sintaticamente válido, deliberadamente inexistente. */
const TOKEN_FANTASMA_APNS = '0'.repeat(64)
const TOKEN_FANTASMA_FCM = 'f'.repeat(140)

const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const erro = (m: string) => console.log(`  \x1b[31m✗\x1b[0m ${m}`)
const info = (m: string) => console.log(`    ${m}`)

let falhou = false

/**
 * O que cada motivo da APNs realmente significa.
 *
 * Esta tabela é metade do valor do script. A Apple devolve um identificador
 * técnico e nada mais; o que a pessoa precisa saber é qual das cinco variáveis
 * está errada.
 */
const APNS_DIAGNOSTICO: Record<string, { bom: boolean; diz: string }> = {
  BadDeviceToken: {
    bom: true,
    diz: 'Autenticação ACEITA. A Apple validou chave, Key ID, Team ID e bundle — só recusou o token fantasma, que é o esperado.',
  },
  Unregistered: {
    bom: true,
    diz: 'Autenticação ACEITA (a Apple chegou a consultar o token).',
  },
  InvalidProviderToken: {
    bom: false,
    diz: 'APNS_KEY_ID, APNS_TEAM_ID ou o conteúdo de APNS_KEY_P8 não combinam entre si. Confira se o Key ID é o do MESMO arquivo .p8 que você colou.',
  },
  ExpiredProviderToken: {
    bom: false,
    diz: 'O relógio desta máquina está fora de hora em relação ao da Apple.',
  },
  TopicDisallowed: {
    bom: false,
    diz: 'APNS_BUNDLE_ID não está autorizado para esta chave. A chave precisa ter "Apple Push Notifications service (APNs)" marcado, e o bundle precisa existir no seu time.',
  },
  MissingTopic: { bom: false, diz: 'APNS_BUNDLE_ID está vazio.' },
  Forbidden: { bom: false, diz: 'A chave não tem permissão de APNs.' },
}

async function verificarApns() {
  console.log('\n\x1b[1mAPNs — iOS\x1b[0m')

  const cfg = apnsConfig()
  if (!cfg) {
    erro('Credencial ausente ou incompleta.')
    info('Faltando uma ou mais de: APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID')
    info('Nenhum iPhone receberá notificação. Ver docs/39-native-shell.md §4.1')
    falhou = true
    return
  }

  info(`host    ${cfg.host}${cfg.host.includes('sandbox') ? '  (APNS_ENVIRONMENT=sandbox)' : '  (produção)'}`)
  info(`team    ${cfg.teamId}   key ${cfg.keyId}   bundle ${cfg.bundleId}`)

  let jwt: string
  try {
    jwt = assinarApnsJwt(cfg, Math.floor(Date.now() / 1000))
  } catch (e) {
    // Quase sempre PEM malformado — o `.p8` colado pela metade, ou sem as
    // linhas BEGIN/END.
    erro(`Não consegui assinar o JWT com APNS_KEY_P8: ${e instanceof Error ? e.message : e}`)
    info('O valor precisa incluir as linhas "-----BEGIN PRIVATE KEY-----" e "-----END PRIVATE KEY-----".')
    falhou = true
    return
  }
  ok('JWT ES256 assinado com a chave .p8')

  const sessao = http2.connect(`https://${cfg.host}`)
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout de conexão')), 10000)
      sessao.once('error', e => { clearTimeout(t); reject(e) })
      sessao.once('connect', () => { clearTimeout(t); resolve() })
    })

    const { status, reason } = await new Promise<{ status: number; reason?: string }>(resolve => {
      const req = sessao.request({
        ':method': 'POST',
        ':path': `/3/device/${TOKEN_FANTASMA_APNS}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': cfg.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '5',
        'content-type': 'application/json',
      })
      let st = 0
      let corpo = ''
      req.on('response', h => { st = Number(h[':status'] ?? 0) })
      req.setEncoding('utf8')
      req.on('data', c => { corpo += c })
      req.on('error', () => resolve({ status: 0, reason: 'stream error' }))
      req.on('end', () => {
        let r: string | undefined
        try { r = JSON.parse(corpo).reason } catch { /* corpo não-JSON */ }
        resolve({ status: st, reason: r })
      })
      req.end(JSON.stringify({ aps: { alert: { title: 'check', body: 'check' } } }))
    })

    const d = reason ? APNS_DIAGNOSTICO[reason] : undefined
    if (d?.bom) {
      ok(`Credenciais VÁLIDAS  (HTTP ${status} · ${reason})`)
      info(d.diz)
    } else if (d) {
      erro(`Credenciais recusadas  (HTTP ${status} · ${reason})`)
      info(d.diz)
      falhou = true
    } else {
      erro(`Resposta inesperada  (HTTP ${status} · ${reason ?? 'sem motivo'})`)
      info('Se persistir, confira docs/39-native-shell.md §4.1.')
      falhou = true
    }
  } catch (e) {
    erro(`Não consegui falar com ${cfg.host}: ${e instanceof Error ? e.message : e}`)
    falhou = true
  } finally {
    sessao.close()
  }
}

async function verificarFcm() {
  console.log('\n\x1b[1mFCM — Android\x1b[0m')

  const cfg = fcmConfig()
  if (!cfg) {
    erro('FCM_SERVICE_ACCOUNT_JSON ausente, inválido ou incompleto.')
    info('Precisa ser o JSON inteiro da conta de serviço, com project_id, client_email e private_key.')
    info('Nenhum Android receberá notificação. Ver docs/39-native-shell.md §4.2')
    falhou = true
    return
  }

  info(`projeto ${cfg.projectId}`)
  info(`conta   ${cfg.clientEmail}`)

  let jwt: string
  try {
    jwt = assinarFcmJwt(cfg, Math.floor(Date.now() / 1000))
  } catch (e) {
    erro(`Não consegui assinar o JWT com a private_key: ${e instanceof Error ? e.message : e}`)
    falhou = true
    return
  }
  ok('JWT RS256 assinado com a chave da conta de serviço')

  // Passo 1 — trocar o JWT por um access token. Isto sozinho já prova que a
  // conta de serviço existe e que a chave privada bate com ela.
  const troca = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!troca.ok) {
    const t = await troca.text().catch(() => '')
    erro(`O Google recusou a conta de serviço  (HTTP ${troca.status})`)
    info(t.slice(0, 300))
    info('Chave revogada, conta de serviço apagada, ou JSON de outro projeto.')
    falhou = true
    return
  }
  const access = ((await troca.json()) as { access_token?: string }).access_token
  if (!access) {
    erro('O Google respondeu sem access_token.')
    falhou = true
    return
  }
  ok('Conta de serviço ACEITA pelo Google (access token obtido)')

  // Passo 2 — `validate_only` prova acesso ao projeto SEM entregar nada a
  // ninguém. O token fantasma é recusado; o que interessa é COMO.
  const envio = await fetch(`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      validate_only: true,
      message: {
        token: TOKEN_FANTASMA_FCM,
        notification: { title: 'check', body: 'check' },
        android: { priority: 'HIGH', notification: { channel_id: 'eos_alerts' } },
      },
    }),
  })

  const corpo = (await envio.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null
  const st = corpo?.error?.status

  if (envio.ok) {
    ok('Credenciais VÁLIDAS e o projeto aceita mensagens.')
  } else if (st === 'INVALID_ARGUMENT' || st === 'NOT_FOUND' || st === 'UNREGISTERED') {
    ok(`Credenciais VÁLIDAS  (HTTP ${envio.status} · ${st})`)
    info('O Google validou a conta e o projeto — só recusou o token fantasma, que é o esperado.')
  } else if (envio.status === 403) {
    erro(`Sem permissão no projeto  (HTTP 403 · ${st})`)
    info('A conta de serviço precisa do papel "Firebase Cloud Messaging API Admin" (ou Editor) no projeto.')
    info('Confira também se a API "Firebase Cloud Messaging API" está ATIVADA no Google Cloud Console.')
    falhou = true
  } else if (envio.status === 404) {
    erro(`Projeto não encontrado  (HTTP 404 · ${st})`)
    info(`"${cfg.projectId}" não existe ou a conta não o enxerga.`)
    falhou = true
  } else {
    erro(`Resposta inesperada  (HTTP ${envio.status} · ${st ?? 'sem status'})`)
    info((corpo?.error?.message ?? '').slice(0, 300))
    falhou = true
  }
}

async function main() {
  console.log('\nVerificação de credenciais de push nativo (D-228 · MOB-T03)')
  console.log('Nenhuma notificação é enviada: o destinatário é um token que não existe.')
  console.log(`Lendo variáveis de: ${ARQUIVO_ENV}`)

  await verificarApns()
  await verificarFcm()

  console.log('')
  if (falhou) {
    console.log('\x1b[31mUma ou mais credenciais NÃO funcionam.\x1b[0m')
    console.log('Enquanto isso durar, o app instala, abre e não notifica.\n')
    process.exit(1)
  }
  console.log('\x1b[32mAs duas plataformas estão prontas para notificar.\x1b[0m\n')
}

void main()
