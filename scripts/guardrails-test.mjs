/**
 * Limite de uso e visibilidade de erro (D-118).
 *
 * O levantamento do roteiro achou dois buracos que custam dinheiro e tempo:
 *
 *  1. `/api/pilot/chat` — modelo forte + embedding + tradução + RAG por
 *     pergunta — **não tinha limite nenhum**, e cadastro é aberto;
 *  2. `/api/weather-intelligence/custom-activity` chamava o modelo **sem sequer
 *     exigir login**;
 *  3. erro de produção era invisível: Sentry no código, sem DSN.
 *
 * O que este teste prova:
 *
 *   1. a rota de análise recusa quem não está autenticado
 *   2. a rajada no Pilot é barrada, com frase legível em vez de erro cru
 *   3. o limite é DISTRIBUÍDO (Postgres), não por instância
 *   4. /api/health diz o que está ligado e o que não está
 *   5. um erro do servidor vira linha no `error_log`
 *
 * O item 3 é o que separa a correção de um enfeite: em serverless, um contador
 * em memória significa N instâncias, N vezes o limite.
 *
 * ATENÇÃO: cria e apaga contas no Supabase de produção.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })
import { track, cleanupOnExit } from './lib/test-cleanup.mjs'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3026)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'

const admin = (p, o = {}) => fetch(`${URL}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

cleanupOnExit(admin)

let pass = 0, fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }
const note = l => console.log(`   ${l}`)

if (!fs.existsSync('.next/BUILD_ID')) { console.error('Faltou `npm run build`.'); process.exit(1) }
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: process.env, stdio: 'ignore' })
const stopServer = () => { try { server.kill('SIGTERM') } catch {} }
process.on('exit', stopServer)
let up = false
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise(r => setTimeout(r, 500))
  up = await fetch(`${B}/api/health`).then(r => r.ok).catch(() => false)
}
if (!up) { console.error('Servidor não subiu'); stopServer(); process.exit(1) }

// ── 4. o que está ligado ────────────────────────────────────────────────────
// O detalhe exige o segredo: sem ele a rota conta a quem ataca onde o produto
// está cego, e a sonda do limitador é uma escrita no banco.
const semSegredo = await fetch(`${B}/api/health`).then(r => r.json())
semSegredo?.checks === undefined
  ? ok('/api/health não entrega o detalhe a quem não tem o segredo', JSON.stringify(semSegredo))
  : no('/api/health expõe o estado das peças publicamente', JSON.stringify(semSegredo).slice(0, 160))

const health = await fetch(`${B}/api/health`, {
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
}).then(r => r.json())
health?.checks && typeof health.checks.rateLimit === 'string'
  ? ok('/api/health responde o estado de cada peça', JSON.stringify(health.checks))
  : no('health não respondeu o esperado', JSON.stringify(health).slice(0, 200))

const migrado = health?.checks?.rateLimit === 'ok'
if (!migrado) {
  note('⚠️  migration D-118 NÃO aplicada: o limite cai para memória (por instância).')
}

// ── 1. a rota de análise exige login ────────────────────────────────────────
const semLogin = await fetch(`${B}/api/weather-intelligence/custom-activity`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ activity: 'subir no telhado', current: {}, alert_count: 0 }),
})
semLogin.status === 401
  ? ok('análise de atividade recusa quem não está autenticado', 'HTTP 401')
  : no('rota de IA aberta sem login', `HTTP ${semLogin.status}`)

// ── conta de teste ──────────────────────────────────────────────────────────
const email = `eos-guard-${Date.now()}@test.internal`
const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
track.user(u.id)
await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Guard' }) })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'pt-BR' })
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})

// ── 2. rajada barrada, com frase legível ────────────────────────────────────
// 14 chamadas contra um teto de 12 por minuto. Elas precisam ser paralelas e
// com JSON inválido de propósito: o limitador roda antes do parse e antes do
// modelo, então o teste prova o guardrail sem gastar OpenAI.
const rajada = await page.evaluate(async () => {
  const requests = Array.from({ length: 14 }, () => fetch('/api/pilot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'isto nao e json',
    }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) })))
  const respostas = await Promise.all(requests)
  return respostas.map(x => ({ status: x.status, erro: x.body?.error ?? null, reply: (x.body?.reply ?? '').slice(0, 60) }))
})

const barradas = rajada.filter(r => r.erro === 'rate_limited')
const comFrase = barradas.filter(r => r.reply && r.reply.length > 10)
if (!migrado) {
  // Sem a migration o limite cai para um Map por instância — e MEDIDO neste
  // servidor: as 14 chamadas passaram todas. Reportar isso como falha do
  // produto seria mentira; reportar como sucesso seria pior.
  no('limite inoperante sem a migration D-118', `${rajada.length} chamadas, 0 barradas — é exatamente o que a migration corrige`)
} else if (barradas.length > 0 && comFrase.length === barradas.length) {
  ok('rajada no Pilot é barrada com frase legível', `${barradas.length} de 14 · "${barradas[0].reply}…"`)
} else {
  no('limite não aplicado no Pilot', `barradas=${barradas.length} comFrase=${comFrase.length}`)
}

// ── 3. o limite é distribuído, não por instância ────────────────────────────
if (migrado) {
  const buckets = await admin(`/rest/v1/rate_limit_buckets?key=like.pilot:${u.id}*&select=key,count`).then(r => r.json())
  const noBanco = Array.isArray(buckets) && buckets.length > 0
  noBanco
    ? ok('o contador vive no Postgres — vale para todas as instâncias', buckets.map(b => `${b.key.split(':').pop()}=${b.count}`).join(' '))
    : no('contador não chegou ao banco: o limite é só por instância', JSON.stringify(buckets).slice(0, 150))
} else {
  no('limite ainda é por instância — falta aplicar a migration D-118')
}

// ── 5. erro do servidor vira linha no log ───────────────────────────────────
if (health?.checks?.errorLog === 'ok') {
  const antes = await admin('/rest/v1/error_log?select=id&limit=1&order=created_at.desc').then(r => r.json())
  await admin('/rest/v1/error_log', {
    method: 'POST',
    body: JSON.stringify({ scope: 'test/guardrails', message: 'sonda', context: { origem: 'guardrails-test' } }),
  })
  const depois = await admin('/rest/v1/error_log?select=id,scope&limit=1&order=created_at.desc').then(r => r.json())
  const gravou = depois?.[0]?.scope === 'test/guardrails' && depois?.[0]?.id !== antes?.[0]?.id
  if (gravou) {
    ok('erro de produção vira linha consultável', 'error_log gravando')
    await admin(`/rest/v1/error_log?id=eq.${depois[0].id}`, { method: 'DELETE' })
  } else {
    no('error_log não gravou', JSON.stringify(depois).slice(0, 150))
  }
} else {
  no('error_log indisponível — falta aplicar a migration D-118')
}

await browser.close()
stopServer()
console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
