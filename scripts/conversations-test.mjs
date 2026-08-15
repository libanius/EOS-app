/**
 * A conversa contra o banco REAL (COMMS-T12 / D-188).
 *
 * O módulo puro já garante que a chave é simétrica. Este script garante o que
 * ele não alcança: que dois usuários DIFERENTES, abrindo pelos dois lados,
 * caem no mesmo thread — e que quem não participa não entra.
 *
 * O defeito que ele existe para pegar é silencioso por natureza: dois threads
 * paralelos não lançam erro, não somem da tela e não aparecem no `error_log`.
 * As duas pessoas simplesmente conversam sozinhas.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
import { track, cleanupOnExit, finish } from './lib/test-cleanup.mjs'

config({ path: '.env.local' })

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3061)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'

if (!URL_SB || !KEY) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = (path, options = {}) => fetch(`${URL_SB}${path}`, {
  ...options,
  headers: {
    'Content-Type': 'application/json',
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    Prefer: 'return=representation',
    ...options.headers,
  },
})

cleanupOnExit(admin)

let pass = 0, fail = 0
const ok = (l, d = '') => { pass += 1; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail += 1; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

if (!fs.existsSync('.next/BUILD_ID')) {
  console.error('Faltou `npm run build`.')
  process.exit(1)
}

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: process.env, stdio: 'ignore' })
const stopServer = () => { try { server.kill('SIGTERM') } catch {} }
process.on('exit', stopServer)

let up = false
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise(r => setTimeout(r, 500))
  up = await fetch(`${B}/auth/login`).then(r => r.status < 500).catch(() => false)
}
if (!up) { console.error('Servidor não subiu'); stopServer(); await finish(1) }

async function mkUser(nome) {
  const email = `eos-conv-${nome.toLowerCase()}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASS, email_confirm: true }),
  }).then(r => r.json())
  track.user(u.id)
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: nome }) })
  return { id: u.id, email, name: nome }
}

const ana = await mkUser('Ana')
const bruno = await mkUser('Bruno')
const forasteiro = await mkUser('Forasteiro')

const circle = await admin('/rest/v1/circles', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Círculo Conversa', leader_id: ana.id,
    invite_code: Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6),
  }),
}).then(r => r.json())
track.circle(circle[0]?.id)
const circleId = circle[0].id
await admin('/rest/v1/circle_members', {
  method: 'POST',
  body: JSON.stringify([
    { circle_id: circleId, user_id: ana.id, role: 'Admin', share_inventory: true, shared_fields: [] },
    { circle_id: circleId, user_id: bruno.id, role: 'Editor', share_inventory: true, shared_fields: [] },
  ]),
})
console.log('— círculo com Ana e Bruno; Forasteiro fora dele\n')

const browser = await chromium.launch({ args: ['--no-sandbox'] })

async function login(user) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'pt-BR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
  const page = await ctx.newPage()
  await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', user.email)
  await page.fill('input[type="password"]', PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})
  return page
}

const chamar = (page, path, method = 'GET', body) =>
  page.evaluate(async ({ path, method, body }) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }, { path, method, body })

try {
  const pAna = await login(ana)
  const pBruno = await login(bruno)

  // ── 1. A conversa do círculo existe sozinha ───────────────────────────────
  const lista = await chamar(pAna, '/api/comms/conversations')
  const doCirculo = (lista.body?.conversations ?? []).filter(c => c.kind === 'circle')
  doCirculo.length === 1
    ? ok('a conversa do círculo aparece na lista', doCirculo[0].id.slice(0, 8))
    : no('conversa do círculo ausente ou duplicada', JSON.stringify(lista.body).slice(0, 160))

  // ── 2. O CRITÉRIO CENTRAL: os dois lados caem no MESMO thread ─────────────
  const abriuAna = await chamar(pAna, '/api/comms/conversations', 'POST', { circleId, userId: bruno.id })
  const abriuBruno = await chamar(pBruno, '/api/comms/conversations', 'POST', { circleId, userId: ana.id })

  const idA = abriuAna.body?.conversation?.id
  const idB = abriuBruno.body?.conversation?.id
  idA && idA === idB
    ? ok('Ana e Bruno abrem a MESMA conversa direta', idA.slice(0, 8))
    : no('cada lado criou um thread — eles conversariam sozinhos', `${idA} vs ${idB}`)

  const { headers } = await admin(
    `/rest/v1/conversations?circle_id=eq.${circleId}&kind=eq.direct&select=id&limit=1`,
    { headers: { Prefer: 'count=exact' } },
  )
  const total = headers.get('content-range')?.split('/')[1]
  total === '1'
    ? ok('existe UMA linha de conversa direta no banco')
    : no('mais de uma conversa direta para o mesmo par', String(total))

  // Abrir de novo não cria terceira.
  await chamar(pAna, '/api/comms/conversations', 'POST', { circleId, userId: bruno.id })
  const { headers: h2 } = await admin(
    `/rest/v1/conversations?circle_id=eq.${circleId}&kind=eq.direct&select=id&limit=1`,
    { headers: { Prefer: 'count=exact' } },
  )
  h2.get('content-range')?.split('/')[1] === '1'
    ? ok('abrir de novo ENCONTRA, não cria')
    : no('abrir de novo duplicou', String(h2.get('content-range')))

  // ── 3. A mensagem direta chega pelo thread ────────────────────────────────
  const enviou = await chamar(pAna, '/api/comms/messages', 'POST', {
    conversationId: idA, body: 'vou buscar a Isadora',
  })
  enviou.status === 201
    ? ok('Ana manda mensagem na conversa direta')
    : no('envio direto falhou', `${enviou.status} ${JSON.stringify(enviou.body).slice(0, 120)}`)

  const leu = await chamar(pBruno, `/api/comms/messages?conversationId=${idA}`)
  const corpos = (leu.body?.messages ?? []).map(m => m.body)
  corpos.includes('vou buscar a Isadora')
    ? ok('Bruno lê a mensagem no mesmo thread')
    : no('a mensagem não chegou do outro lado', JSON.stringify(corpos).slice(0, 140))

  // ── 4. A conversa direta NÃO vaza para o círculo ──────────────────────────
  // A versão anterior avisava o círculo inteiro. Numa conversa direta isso
  // contaria a terceiros que ela aconteceu, com um trecho do texto junto.
  const avisos = await admin(
    `/rest/v1/circle_notifications?kind=eq.message&select=recipient_id,body&order=created_at.desc&limit=10`,
  ).then(r => r.json())
  const doTeste = (avisos ?? []).filter(n => String(n.body || '').includes('buscar a Isadora'))
  const destinatarios = new Set(doTeste.map(n => n.recipient_id))
  destinatarios.size === 1 && destinatarios.has(bruno.id)
    ? ok('só o destinatário é avisado da mensagem direta')
    : no('a mensagem direta vazou como notificação', JSON.stringify([...destinatarios]).slice(0, 120))

  // ── 5. Quem não participa não entra ───────────────────────────────────────
  const pForasteiro = await login(forasteiro)
  const espiar = await chamar(pForasteiro, `/api/comms/messages?conversationId=${idA}`)
  espiar.status === 403
    ? ok('quem não participa recebe 403 ao ler a conversa')
    : no('a conversa direta ficou legível para fora', String(espiar.status))

  const forcar = await chamar(pForasteiro, '/api/comms/conversations', 'POST', { circleId, userId: ana.id })
  forcar.status === 403
    ? ok('quem não é do círculo não abre conversa com quem é')
    : no('permissão furada ao abrir conversa', String(forcar.status))

  // ── 6. Esconder tira da lista, mensagem nova traz de volta ────────────────
  await chamar(pAna, '/api/comms/conversations', 'PATCH', { conversationId: idA, hidden: true })
  const escondida = await chamar(pAna, '/api/comms/conversations')
  !(escondida.body?.conversations ?? []).some(c => c.id === idA)
    ? ok('esconder tira a conversa da lista')
    : no('a conversa escondida continua na lista')

  await chamar(pBruno, '/api/comms/messages', 'POST', { conversationId: idA, body: 'já cheguei' })
  const voltou = await chamar(pAna, '/api/comms/conversations')
  ;(voltou.body?.conversations ?? []).some(c => c.id === idA)
    ? ok('mensagem NOVA reabre a conversa escondida')
    : no('esconder virou bloqueio silencioso — a mensagem nova não voltou')

  // ── 7. Esconder não apaga nada ────────────────────────────────────────────
  const aindaLa = await chamar(pBruno, `/api/comms/messages?conversationId=${idA}`)
  ;(aindaLa.body?.messages ?? []).length >= 2
    ? ok('esconder não destruiu histórico do outro lado', `${aindaLa.body.messages.length} mensagens`)
    : no('o histórico sumiu para o outro', JSON.stringify(aindaLa.body).slice(0, 140))
} finally {
  await browser.close().catch(() => {})
  stopServer()
}

await admin(`/rest/v1/circles?id=eq.${circleId}`, { method: 'DELETE' })
console.log(`\n${pass} passou · ${fail} falhou`)
await finish(fail ? 1 : 0)
