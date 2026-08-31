/**
 * Push nativo — APNs e FCM (D-228 §3).
 *
 * ── O que estes testes existem para impedir ───────────────────────────────
 *
 * Um erro aqui não aparece como erro. Aparece como um telefone que não toca, e
 * a família só descobre no dia em que precisava. Os dois modos de falha que
 * mais custam caro são:
 *
 *  1. **JWT no formato errado** — a Apple responde token malformado sem dizer
 *     que o problema é a codificação DER da assinatura;
 *  2. **Apagar token vivo** — uma configuração errada faz todos os aparelhos
 *     falharem ao mesmo tempo; se falha virasse remoção, um deploy apagaria a
 *     base inteira e cada família teria de reinstalar o app.
 */

import crypto from 'node:crypto'
import {
  apnsConfig,
  apnsTokenMorreu,
  assinarApnsJwt,
  assinarFcmJwt,
  fcmConfig,
  fcmTokenMorreu,
  limparCacheDeCredenciais,
  montarApnsPayload,
  montarFcmMensagem,
  normalizarPem,
  enviarParaAparelhos,
} from '@/lib/push-native'

// Chaves de teste geradas na hora: nada de credencial de verdade no repositório.
const ec = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})
const rsa = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const decodifica = (parte: string) =>
  JSON.parse(Buffer.from(parte.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())

beforeEach(() => limparCacheDeCredenciais())

describe('normalizarPem', () => {
  it('converte \\n literal em quebra de linha real', () => {
    // Colar o `private_key` de um service account JSON traz `\n` como DUAS
    // letras. `crypto` recusa o PEM com uma mensagem que não menciona isso, e a
    // única pista visível é o push parar de sair.
    const cru = '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----'
    expect(normalizarPem(cru)).toBe('-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----')
  })

  it('não mexe num PEM que já tem quebras reais', () => {
    const ok = '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----'
    expect(normalizarPem(ok)).toBe(ok)
  })
})

describe('configuração', () => {
  const completa = {
    APNS_KEY_P8: ec.privateKey,
    APNS_KEY_ID: 'ABC123DEFG',
    APNS_TEAM_ID: 'TEAM123456',
    APNS_BUNDLE_ID: 'app.eos.family',
  }

  it('devolve null quando falta qualquer parte', () => {
    for (const chave of Object.keys(completa)) {
      const parcial: Record<string, string | undefined> = { ...completa }
      delete parcial[chave]
      expect(apnsConfig(parcial)).toBeNull()
    }
  })

  it('usa o host de produção por padrão e o sandbox quando pedido', () => {
    expect(apnsConfig(completa)?.host).toBe('api.push.apple.com')
    expect(apnsConfig({ ...completa, APNS_ENVIRONMENT: 'sandbox' })?.host).toBe(
      'api.sandbox.push.apple.com',
    )
  })

  it('lê o service account do FCM e recusa JSON inválido ou incompleto', () => {
    const bom = JSON.stringify({
      project_id: 'eos-prod',
      client_email: 'push@eos.iam.gserviceaccount.com',
      private_key: rsa.privateKey,
    })
    expect(fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: bom })?.projectId).toBe('eos-prod')
    expect(fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: 'não é json' })).toBeNull()
    expect(fcmConfig({ FCM_SERVICE_ACCOUNT_JSON: '{"project_id":"x"}' })).toBeNull()
    expect(fcmConfig({})).toBeNull()
  })
})

describe('JWT da APNs', () => {
  const cfg = {
    keyP8: ec.privateKey,
    keyId: 'ABC123DEFG',
    teamId: 'TEAM123456',
    bundleId: 'app.eos.family',
    host: 'api.push.apple.com',
  }

  it('põe alg ES256 e o kid no cabeçalho, e o team id como emissor', () => {
    const [h, c] = assinarApnsJwt(cfg, 1_700_000_000).split('.')
    expect(decodifica(h)).toEqual({ alg: 'ES256', kid: 'ABC123DEFG', typ: 'JWT' })
    expect(decodifica(c)).toEqual({ iss: 'TEAM123456', iat: 1_700_000_000 })
  })

  it('assina em formato JOSE cru de 64 bytes, não em DER', () => {
    /*
     * ESTE é o teste que paga o arquivo.
     *
     * O padrão do Node para chave EC é DER, de tamanho variável (70–72 bytes) e
     * começando com `0x30`. A Apple exige `r || s` — exatamente 64 bytes crus —
     * e recusa o DER como "token malformado", sem dizer por quê. Sem
     * `dsaEncoding: 'ieee-p1363'` nenhum iPhone jamais receberia nada.
     */
    const [, , sig] = assinarApnsJwt(cfg, 1_700_000_000).split('.')
    const bytes = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    expect(bytes.length).toBe(64)
    expect(bytes[0]).not.toBe(0x30)
  })

  it('produz assinatura que a chave pública verifica', () => {
    const jwt = assinarApnsJwt(cfg, 1_700_000_000)
    const [h, c, sig] = jwt.split('.')
    const ok = crypto.verify(
      'sha256',
      Buffer.from(`${h}.${c}`),
      { key: ec.publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
    )
    expect(ok).toBe(true)
  })

  it('não deixa padding "=" no base64url', () => {
    // `=` é caractere inválido em JWT e alguns servidores rejeitam sem explicar.
    expect(assinarApnsJwt(cfg, 1_700_000_000)).not.toContain('=')
  })
})

describe('JWT do FCM', () => {
  const cfg = {
    projectId: 'eos-prod',
    clientEmail: 'push@eos.iam.gserviceaccount.com',
    privateKey: rsa.privateKey,
  }

  it('pede o escopo de mensageria, para o endereço certo, com validade de 1h', () => {
    const [h, c] = assinarFcmJwt(cfg, 1_700_000_000).split('.')
    expect(decodifica(h)).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(decodifica(c)).toEqual({
      iss: 'push@eos.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    })
  })

  it('produz assinatura RS256 verificável', () => {
    const [h, c, sig] = assinarFcmJwt(cfg, 1_700_000_000).split('.')
    const ok = crypto.verify(
      'sha256',
      Buffer.from(`${h}.${c}`),
      rsa.publicKey,
      Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
    )
    expect(ok).toBe(true)
  })
})

describe('formato das mensagens', () => {
  it('APNs: alerta com título e corpo, e a url para o toque levar a algum lugar', () => {
    const p = montarApnsPayload({ title: 'Furacão', body: 'a 40 km', url: '/dashboard-world' })
    expect(p).toEqual({
      aps: { alert: { title: 'Furacão', body: 'a 40 km' }, sound: 'default', 'mutable-content': 1 },
      url: '/dashboard-world',
    })
  })

  it('APNs: sem url cai no dashboard em vez de ficar sem destino', () => {
    expect((montarApnsPayload({ title: 't', body: 'b' }) as { url: string }).url).toBe('/dashboard')
  })

  it('FCM: aponta para o canal que o MainActivity cria', () => {
    /*
     * Canal inexistente faz o Android 8+ DESCARTAR a notificação em silêncio: o
     * servidor relata sucesso e o telefone nunca toca. O id aqui tem de ser
     * idêntico ao de `MainActivity.criarCanalDeAlertas()` e ao de `strings.xml`.
     */
    const m = montarFcmMensagem('tok', { title: 't', body: 'b' }) as {
      message: { android: { notification: { channel_id: string }; priority: string } }
    }
    expect(m.message.android.notification.channel_id).toBe('eos_alerts')
    expect(m.message.android.priority).toBe('HIGH')
  })

  it('FCM: todo valor de `data` é string', () => {
    // O FCM v1 recusa a mensagem INTEIRA com INVALID_ARGUMENT se `data` tiver
    // um número. Um alerta perdido por causa disso não deixa rastro no aparelho.
    const m = montarFcmMensagem('tok', { title: 't', body: 'b', url: '/plan' }) as {
      message: { data: Record<string, unknown> }
    }
    for (const v of Object.values(m.message.data)) expect(typeof v).toBe('string')
  })
})

describe('quem está morto de verdade', () => {
  it('APNs: só Unregistered / 410', () => {
    expect(apnsTokenMorreu(410, 'Unregistered')).toBe(true)
    expect(apnsTokenMorreu(400, 'Unregistered')).toBe(true)
  })

  it('APNs: BadDeviceToken NÃO remove — é indistinguível de ambiente trocado', () => {
    /*
     * A APNs devolve `BadDeviceToken` tanto para um token inválido quanto para
     * um token de DESENVOLVIMENTO enviado ao host de produção. Como a resposta
     * é a mesma, tratar isso como morte transformaria um `APNS_ENVIRONMENT`
     * errado num deploy que apaga todos os iPhones da base — e a recuperação
     * exigiria cada família reabrir o app.
     */
    expect(apnsTokenMorreu(400, 'BadDeviceToken')).toBe(false)
    expect(apnsTokenMorreu(403, 'InvalidProviderToken')).toBe(false)
    expect(apnsTokenMorreu(413, 'PayloadTooLarge')).toBe(false)
    expect(apnsTokenMorreu(500, 'InternalServerError')).toBe(false)
    expect(apnsTokenMorreu(429, 'TooManyRequests')).toBe(false)
  })

  it('FCM: só UNREGISTERED / 404', () => {
    expect(fcmTokenMorreu(404, null)).toBe(true)
    expect(fcmTokenMorreu(400, { error: { status: 'UNREGISTERED' } })).toBe(true)
  })

  it('FCM: INVALID_ARGUMENT e SENDER_ID_MISMATCH NÃO removem', () => {
    // Os dois são erro de configuração ou payload — defeito nosso, que atinge
    // todos os aparelhos de uma vez.
    expect(fcmTokenMorreu(400, { error: { status: 'INVALID_ARGUMENT' } })).toBe(false)
    expect(fcmTokenMorreu(403, { error: { status: 'SENDER_ID_MISMATCH' } })).toBe(false)
    expect(fcmTokenMorreu(503, { error: { status: 'UNAVAILABLE' } })).toBe(false)
    expect(fcmTokenMorreu(401, null)).toBe(false)
  })
})

describe('enviarParaAparelhos sem credencial', () => {
  const semCredencial = { ...process.env }
  beforeEach(() => {
    delete process.env.APNS_KEY_P8
    delete process.env.APNS_KEY_ID
    delete process.env.APNS_TEAM_ID
    delete process.env.APNS_BUNDLE_ID
    delete process.env.FCM_SERVICE_ACCOUNT_JSON
  })
  afterAll(() => {
    process.env = semCredencial
  })

  it('conta aparelho sem credencial como FALHA, não como inexistente', async () => {
    /*
     * A D-119 escreveu `sendPush` para que "não enviei" nunca se confunda com
     * "enviei". Omitir estes daria um relatório de zero falhas com a base
     * inteira sem receber nada — a mesma mentira, com outra roupa.
     */
    const r = await enviarParaAparelhos(
      [
        { token: 'a', platform: 'ios' },
        { token: 'b', platform: 'android' },
      ],
      { title: 't', body: 'b' },
    )
    expect(r).toEqual({
      sent: 0,
      failed: 2,
      dead: [],
      notConfigured: ['ios', 'android'],
    })
  })

  it('não remove nada quando a credencial falta', async () => {
    const r = await enviarParaAparelhos([{ token: 'a', platform: 'ios' }], { title: 't', body: 'b' })
    expect(r.dead).toEqual([])
  })

  it('lista vazia não vira chamada de rede', async () => {
    await expect(enviarParaAparelhos([], { title: 't', body: 'b' })).resolves.toEqual({
      sent: 0,
      failed: 0,
      dead: [],
      notConfigured: [],
    })
  })
})
