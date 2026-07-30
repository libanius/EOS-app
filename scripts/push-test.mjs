/**
 * Push ponta a ponta, com navegador real (D-074).
 *
 * Prova, em ordem, cada elo da corrente que faz uma notificação aparecer:
 *
 *   1. o manifesto de precache do service worker é 100% buscável
 *   2. o service worker instala e ATIVA num build de produção, sem erro nenhum
 *   3. /api/push/subscribe grava uma inscrição real (chaves ECDH P-256 de verdade)
 *   4. /api/family/ping emite uma requisição Web Push autêntica, assinada em VAPID
 *   5. o payload dela DESCRIPTOGRAFA para o texto exato esperado (RFC 8291)
 *   6. o handler real de push-sw.js transforma esse payload numa notificação
 *      EXIBIDA, lida de `registration.getNotifications()`
 *
 * O teste 1 é o guarda-de-regressão do bug que originou tudo isto: o next-pwa
 * colocava `/_next/app-build-manifest.json` no precache, o Next não serve esse
 * arquivo, e o precache é ATÔMICO — um único 404 rejeitava o `waitUntil` do
 * install, o worker virava `redundant` e NENHUM push jamais funcionou. Nada disso
 * aparecia como erro de push; aparecia como um botão que não mudava de estado.
 *
 * O ÚNICO elo não exercitado aqui é o transporte do Google (FCM) entre navegador
 * e servidor de push: `pushManager.subscribe()` falha com "Registration failed -
 * permission denied" em qualquer Chrome/Chromium automatizado, então a inscrição
 * é fabricada com as MESMAS primitivas que o navegador usaria, e a entrega ao
 * worker é feita via CDP `ServiceWorker.deliverPushMessage`. O código do EOS
 * exercitado é o real, do começo ao fim; só a transportadora é substituída.
 *
 * Exige o Google Chrome instalado (o Chromium empacotado do Playwright nega
 * permissão de notificação) e um build de produção presente. O teste sobe e
 * derruba o próprio `next start` na porta 3010, porque o servidor precisa
 * confiar no CA do serviço de push falso.
 *
 *   npm run build
 *   node scripts/push-test.mjs
 *
 * ATENÇÃO: cria e apaga contas no Supabase de produção.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const PORT = Number(process.env.PORT || 3010)
const B = `http://localhost:${PORT}`
const PUSH_PORT = Number(process.env.PUSH_PORT || 4599)
const CERT_DIR = path.resolve('.push-test-cert')
const PASS = 'EosTest#2026!'

const admin = (p, o = {}) => fetch(`${URL}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

let pass = 0, fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

// ─── cripto do Web Push (RFC 8188 + RFC 8291) ────────────────────────────────

const b64u = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest()

/**
 * Uma inscrição de push É um par de chaves ECDH P-256 mais um segredo de 16
 * bytes. É exatamente isto que o navegador gera e entrega em `getKey()`; a única
 * diferença é que o endpoint aqui é nosso, não do FCM.
 */
function makeSubscription(endpoint) {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  const publicRaw = ecdh.getPublicKey() // 65 bytes, não comprimido
  const authSecret = crypto.randomBytes(16)
  return {
    ecdh,
    publicRaw,
    authSecret,
    json: { endpoint, keys: { p256dh: b64u(publicRaw), auth: b64u(authSecret) } },
  }
}

/** Descriptografa um corpo `aes128gcm` com a chave privada da inscrição. */
function decryptPush(body, sub) {
  const salt = body.subarray(0, 16)
  const idlen = body.readUInt8(20)
  const asPublic = body.subarray(21, 21 + idlen)
  const ciphertext = body.subarray(21 + idlen)

  const shared = sub.ecdh.computeSecret(asPublic)
  const prkKey = hmac(sub.authSecret, shared)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), sub.publicRaw, asPublic, Buffer.from([1])])
  const prk = hmac(salt, hmac(prkKey, keyInfo))
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16)
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12)

  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce)
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16))
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()])

  // Remove o preenchimento: zeros à direita e o delimitador de registro.
  let end = plain.length - 1
  while (end >= 0 && plain[end] === 0) end -= 1
  return plain.subarray(0, end).toString('utf8')
}

/** Confere a assinatura ES256 do cabeçalho `Authorization: vapid t=…,k=…`. */
function vapidIsValid(header, expectedPublicKey) {
  const t = /t=([^,]+)/.exec(header ?? '')?.[1]
  const k = /k=([^,\s]+)/.exec(header ?? '')?.[1]
  if (!t || !k || k !== expectedPublicKey) return false
  const [h, p, sig] = t.split('.')
  const raw = unb64u(k)
  const key = crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)) },
    format: 'jwk',
  })
  return crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, unb64u(sig))
}

// ─── servidor de push local (o papel do FCM) ─────────────────────────────────

/**
 * A biblioteca `web-push` fala HTTPS sempre — um endpoint `http://` morre com
 * EPROTO. Então o serviço de push falso usa TLS de verdade, com um certificado
 * autoassinado que o servidor Next passa a confiar via `NODE_EXTRA_CA_CERTS`.
 * Isso mantém a verificação de certificado LIGADA: nada de desabilitar TLS.
 */
const received = []
const pushServer = https.createServer(
  {
    key: fs.readFileSync(path.join(CERT_DIR, 'key.pem')),
    cert: fs.readFileSync(path.join(CERT_DIR, 'cert.pem')),
  },
  (req, res) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks) })
      res.writeHead(201).end()
    })
  },
)
await new Promise(r => pushServer.listen(PUSH_PORT, '127.0.0.1', r))

// O servidor de produção é subido AQUI, por dois motivos: precisa confiar no CA
// do serviço de push falso, e precisa ser o build recém-gerado (o next-pwa
// desliga o service worker em dev, então `next dev` nunca passaria).
if (!fs.existsSync('.next/BUILD_ID')) {
  console.error('Faltou `npm run build` — este teste exige build de produção.')
  process.exit(1)
}
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: { ...process.env, NODE_EXTRA_CA_CERTS: path.join(CERT_DIR, 'cert.pem') },
  stdio: 'ignore',
})
const stopServer = () => { try { server.kill('SIGTERM') } catch {} }
process.on('exit', stopServer)

let up = false
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise(r => setTimeout(r, 500))
  up = await fetch(`${B}/sw.js`).then(r => r.ok).catch(() => false)
}
if (!up) { console.error(`Servidor não subiu em ${B}`); stopServer(); process.exit(1) }
console.log(`— servidor de produção em ${B}, serviço de push em https://127.0.0.1:${PUSH_PORT}`)

// ─── contas ──────────────────────────────────────────────────────────────────

async function mkUser(name) {
  const email = `eos-push-${name}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name, location_lat: 26.31, location_lng: -80.24 }) })
  return { id: u.id, email, name }
}

async function login(browser, user) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })
  await ctx.grantPermissions(['notifications'], { origin: B })
  const page = await ctx.newPage()
  await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', user.email)
  await page.fill('input[type="password"]', PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha|onboarding/, { timeout: 30000 }).catch(() => {})
  return { page, ctx }
}

const dest = await mkUser('dest')
const remet = await mkUser('remet')
const circle = await admin('/rest/v1/circles', { method: 'POST', body: JSON.stringify({
  name: 'Push Teste', leader_id: remet.id,
  invite_code: Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6),
}) }).then(r => r.json())
await admin('/rest/v1/circle_members', { method: 'POST', body: JSON.stringify([
  { circle_id: circle[0].id, user_id: remet.id, role: 'Admin', share_inventory: true, shared_fields: [] },
  { circle_id: circle[0].id, user_id: dest.id, role: 'Editor', share_inventory: true, shared_fields: [] },
]) })
console.log('— duas contas num círculo\n')

// ── 1. todo URL do precache tem que responder 200 ────────────────────────────
// O bug era exatamente isto: um único 404 aqui derruba o install inteiro.
{
  const sw = await fetch(`${B}/sw.js`).then(r => r.text())
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map(m => m[1])
  const bad = []
  for (const u of urls) {
    const r = await fetch(`${B}${u.startsWith('/') ? u : `/${u}`}`).catch(() => null)
    if (!r?.ok) bad.push(`${r?.status ?? 'ERR'} ${u}`)
  }
  const imports = sw.includes('importScripts("/push-sw.js")')
  const handler = await fetch(`${B}/push-sw.js`).then(r => r.ok).catch(() => false)
  if (urls.length && !bad.length && imports && handler) {
    ok('precache 100% buscável', `${urls.length} arquivos, push-sw.js importado`)
  } else {
    no('precache quebrado', bad.slice(0, 5).join(' | ') || `imports=${imports} push-sw=${handler} urls=${urls.length}`)
  }
}

// ── 2. o service worker instala e ativa, sem erro ────────────────────────────
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--no-sandbox'] })
const { page, ctx } = await login(browser, dest)

const swErrors = []
let regId = null
const cdp = await ctx.newCDPSession(page)
await cdp.send('ServiceWorker.enable')
cdp.on('ServiceWorker.workerErrorReported', e => swErrors.push(e.errorMessage))
cdp.on('ServiceWorker.workerRegistrationUpdated', e => {
  for (const r of e.registrations) if (r.scopeURL.startsWith(B)) regId = r.registrationId
})

await page.goto(`${B}/settings`, { waitUntil: 'networkidle' })
const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return 'não registrado'
  await navigator.serviceWorker.ready
  return reg.active ? reg.active.state : 'registrado sem ativar'
})
await page.waitForTimeout(1500)
;(swState === 'activated' || swState === 'activating') && !swErrors.length
  ? ok('service worker instalou e ativou', swState)
  : no('service worker', `${swState}${swErrors.length ? ' · ' + swErrors[0] : ''}`)

// ── 3. /api/push/subscribe grava a inscrição, com as chaves ──────────────────
const sub = makeSubscription(`https://127.0.0.1:${PUSH_PORT}/push/${crypto.randomUUID()}`)
const subRes = await page.evaluate(async payload => {
  const r = await fetch('/api/push/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}, sub.json)

const rows = await admin(`/rest/v1/push_subscriptions?user_id=eq.${dest.id}&select=endpoint,p256dh,auth`).then(r => r.json())
rows?.[0]?.p256dh === sub.json.keys.p256dh && rows[0].auth === sub.json.keys.auth
  ? ok('inscrição gravada com as chaves', `HTTP ${subRes.status}`)
  : no('inscrição NÃO gravada', `HTTP ${subRes.status} · ${JSON.stringify(rows).slice(0, 160)}`)

// ── 4. /api/family/ping emite Web Push autêntico, assinado em VAPID ──────────
const { page: senderPage } = await login(browser, remet)
const ping = await senderPage.evaluate(async to => {
  const r = await fetch('/api/family/ping', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toUserId: to, preset: 'where', pt: true }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}, dest.id)

for (let i = 0; i < 50 && !received.length; i += 1) await new Promise(r => setTimeout(r, 200))
const sent = received[0]
if (ping.body?.ok && sent && vapidIsValid(sent.headers.authorization, VAPID_PUBLIC) && sent.headers['content-encoding'] === 'aes128gcm') {
  ok('Web Push emitido e assinado em VAPID', `${sent.body.length} bytes cifrados`)
} else {
  no('envio falhou', `ping=${JSON.stringify(ping.body)} recebidas=${received.length} enc=${sent?.headers['content-encoding']}`)
}

// ── 5. o payload descriptografa para o texto exato ───────────────────────────
let plaintext = null
try {
  plaintext = sent ? JSON.parse(decryptPush(sent.body, sub)) : null
} catch (e) {
  plaintext = { _erro: String(e) }
}
plaintext?.title?.includes(remet.name) && plaintext.body === 'Onde você está?'
  ? ok('payload descriptografado', JSON.stringify(plaintext))
  : no('payload não descriptografou como esperado', JSON.stringify(plaintext)?.slice(0, 200))

// ── 6. o handler real exibe a notificação ────────────────────────────────────
if (plaintext && !plaintext._erro && regId !== null) {
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: B, registrationId: String(regId), data: JSON.stringify(plaintext),
  })
  await page.waitForTimeout(2500)
}
const shown = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return []
  return (await reg.getNotifications()).map(n => ({ title: n.title, body: n.body, url: n.data?.url }))
})
shown.some(n => n.body === 'Onde você está?')
  ? ok('notificação EXIBIDA pelo push-sw.js', JSON.stringify(shown))
  : no('nenhuma notificação exibida', `regId=${regId} · ${JSON.stringify(shown)}`)

// ─── limpeza ─────────────────────────────────────────────────────────────────
await browser.close()
pushServer.close()
stopServer()
for (const u of [dest, remet]) {
  await admin(`/rest/v1/push_subscriptions?user_id=eq.${u.id}`, { method: 'DELETE' })
  await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'DELETE' })
}
await admin(`/rest/v1/circles?id=eq.${circle[0].id}`, { method: 'DELETE' })

console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
