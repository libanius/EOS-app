/**
 * A telemetria do Pilot, ponta a ponta (PILOT-T04 / D-132).
 *
 * Os testes de unidade provam que a função recusa texto. Este prova que o
 * CAMINHO INTEIRO recusa — rota, RLS e o CHECK do banco — e que o app de
 * verdade escreve os eventos quando a pessoa usa o Pilot.
 *
 * O que este teste prova:
 *
 *   1. abrir o Pilot grava `opened` com o tempo até o primeiro toque
 *   2. usar um chip grava a intenção do MOTOR, não um nome inventado
 *   3. a pergunta digitada NUNCA chega ao banco                  ← o principal
 *   4. uma chave extra é descartada e o evento ainda vale
 *   5. um evento inventado é recusado e DIZ o motivo             ← nada em silêncio
 *   6. o CHECK do banco recusa o que passar pela rota            ← segunda porta
 *   7. ninguém lê a tabela de outra pessoa pelo PostgREST        ← RLS
 *   8. o resumo é 403 para quem não é dono
 *   9. o resumo do dono devolve números, não NaN
 *
 * O item 6 existe porque uma validação só no servidor é uma validação a uma
 * refatoração de distância. O 3 é o que o produto promete.
 *
 * ATENÇÃO: cria e apaga contas no Supabase de produção.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })
import { track, cleanupOnExit, finish } from './lib/test-cleanup.mjs'

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PORT = Number(process.env.PORT || 3074)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'

const admin = (p, o = {}) => fetch(`${URL_SB}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

cleanupOnExit(admin)

let pass = 0, fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

if (!fs.existsSync('.next/BUILD_ID')) { console.error('Faltou `npm run build`.'); process.exit(1) }
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: process.env, stdio: 'ignore' })
const stopServer = () => { try { server.kill('SIGTERM') } catch {} }
process.on('exit', stopServer)
let up = false
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise(r => setTimeout(r, 500))
  up = await fetch(`${B}/auth/login`).then(r => r.status < 500).catch(() => false)
}
if (!up) { console.error('Servidor não subiu'); stopServer(); await finish(1) }

// A tabela existe? Sem isto, todo o resto passaria "verde e vazio".
const sonda = await admin('/rest/v1/pilot_events?select=id&limit=1')
if (sonda.status === 404 || sonda.status === 406) {
  console.error('❌ `pilot_events` não existe — aplique 20260808150000_pilot_events.sql antes de rodar.')
  stopServer()
  await finish(1)
}

const email = `eos-mx-${Date.now()}@test.internal`
const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
track.user(u.id)
await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Ana', location_lat: 26.31, location_lng: -80.2 }) })

const linhas = () => admin(`/rest/v1/pilot_events?user_id=eq.${u.id}&select=event,intent,verdict,surface,ms,created_at&order=created_at.asc`).then(r => r.json())

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true })
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})
await page.goto(`${B}/dashboard`, { waitUntil: 'networkidle' })
await page.waitForTimeout(5000)

// ── 1. abrir o Pilot ───────────────────────────────────────────────────────
await page.locator('.wv2-pilotbar .bar-orb').tap()
await page.waitForTimeout(1500)

const apos = await linhas()
const aberto = apos.find(l => l.event === 'opened')
aberto && typeof aberto.ms === 'number' && aberto.ms > 0
  ? ok('abrir grava `opened` com o tempo até o primeiro toque', `${aberto.ms}ms, surface=${aberto.surface}`)
  : no('não gravou a abertura', JSON.stringify(apos))

// ── 2. o chip grava a intenção do motor ────────────────────────────────────
const chips = page.locator('.chat-suggestions button')
if (await chips.count()) {
  await chips.first().tap()
  await page.waitForTimeout(1200)
  const comIntencao = (await linhas()).find(l => l.event === 'intent')
  const doMotor = ['now', 'stay_or_go', 'endurance', 'gaps', 'outside']
  comIntencao && doMotor.includes(comIntencao.intent)
    ? ok('o chip grava a intenção do MOTOR', `${comIntencao.intent} · surface=${comIntencao.surface}`)
    : no('intenção errada ou ausente', JSON.stringify(comIntencao))
} else {
  no('não achei os chips de intenção', 'o Pilot não abriu?')
}

// ── 3. a pergunta digitada não chega ao banco ──────────────────────────────
const SEGREDO = 'minha mãe tem alzheimer e mora comigo'
const enviou = await page.evaluate(async (texto) => {
  const r = await fetch('/api/pilot/metrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // O cliente real nem consegue mandar isto — a assinatura não tem campo.
    // Aqui é um cliente adulterado, que é a ameaça de verdade.
    body: JSON.stringify({ event: 'asked', intent: 'free', question: texto, lat: 26.31, lng: -80.2 }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}, SEGREDO)

const todas = await linhas()
const comoTexto = JSON.stringify(todas)
!comoTexto.includes('alzheimer') && !comoTexto.includes('26.31')
  ? ok('a pergunta e a coordenada NÃO chegam ao banco', `${todas.length} linhas, nenhuma com o texto`)
  : no('VAZOU conteúdo para a métrica', comoTexto.slice(0, 200))

// ── 4. a chave extra é descartada e o evento ainda vale ────────────────────
enviou.body?.ok && (await linhas()).some(l => l.event === 'asked')
  ? ok('a chave extra é descartada e o evento ainda vale', `recorded=${enviou.body?.recorded ?? '—'}`)
  : no('o evento com chave extra se perdeu inteiro', JSON.stringify(enviou))

// ── 5. evento inventado é recusado, com motivo ─────────────────────────────
const inventado = await page.evaluate(async () => {
  const r = await fetch('/api/pilot/metrics', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'exfiltrate_everything' }),
  })
  return r.json().catch(() => null)
})
typeof inventado?.skipped === 'string' && inventado.skipped.includes('exfiltrate')
  ? ok('evento inventado é recusado e DIZ o motivo', inventado.skipped)
  : no('recusa muda — foi assim que um bug ficou meses escondido', JSON.stringify(inventado))

// ── 6. o CHECK do banco é a segunda porta ──────────────────────────────────
const direto = await admin('/rest/v1/pilot_events', {
  method: 'POST',
  body: JSON.stringify({ user_id: u.id, event: 'nao_existe' }),
})
direto.status >= 400
  ? ok('o CHECK do banco recusa o que passar pela rota', `HTTP ${direto.status}`)
  : no('o banco aceitou um evento fora da lista', `HTTP ${direto.status}`)

// ── 7. RLS: ninguém lê a tabela pelo PostgREST ─────────────────────────────
const comoAnon = await fetch(`${URL_SB}/rest/v1/pilot_events?select=event&limit=1`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
})
const corpoAnon = await comoAnon.json().catch(() => null)
// Sem policy de SELECT, o RLS devolve lista vazia — que é o certo, e é
// diferente de "a tabela não existe".
Array.isArray(corpoAnon) && corpoAnon.length === 0
  ? ok('a tabela não é legível pelo PostgREST', 'RLS sem policy de SELECT')
  : no('a telemetria está exposta', JSON.stringify(corpoAnon)?.slice(0, 160))

// ── 8 e 9. o resumo ────────────────────────────────────────────────────────
const resumoNegado = await page.evaluate(async () => {
  const r = await fetch('/api/pilot/metrics?days=7')
  return { status: r.status }
})
resumoNegado.status === 403
  ? ok('o resumo é 403 para quem não é dono', 'ERROR_ALERT_USER_IDS decide')
  : no('quem não é dono conseguiu o resumo', `HTTP ${resumoNegado.status}`)

/*
 * Para checar o resumo do DONO sem virar dono de mentira em produção, o teste
 * chama a função pura com as linhas que ele mesmo acabou de gerar. É o mesmo
 * código que a rota usa; o que a rota acrescenta (a checagem de dono) já foi
 * exercitada acima.
 */
const { resumirPilot } = await import('../lib/pilot-metrics.ts').catch(() => ({}))
if (resumirPilot) {
  const resumo = resumirPilot((await linhas()).map(l => ({ ...l, user_id: u.id })))
  const temNaN = Object.values(resumo).some(v => typeof v === 'number' && Number.isNaN(v))
  !temNaN && resumo.aberturas >= 1
    ? ok('o resumo devolve números, nunca NaN', `${resumo.aberturas} abertura(s), ${resumo.total} eventos, ação=${resumo.taxaDeAcao}%`)
    : no('o resumo veio com NaN ou vazio', JSON.stringify(resumo))
} else {
  no('não consegui checar o resumo', 'rode com `npx tsx`')
}

await browser.close()
stopServer()
await admin(`/rest/v1/pilot_events?user_id=eq.${u.id}`, { method: 'DELETE' }).catch(() => {})
console.log(`\n${pass} passaram, ${fail} falharam`)
await finish(fail)
