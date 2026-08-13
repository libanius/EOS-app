/**
 * Navegação local da Preparação (PREP-T07 / D-164).
 *
 * Os critérios de aceitação da fase 1 virados em prova de navegador. O que
 * importa aqui não é que a página abre — é que **a barra global não se mexeu**:
 * a promessa de `docs/35` é que sub-rotas de um domínio não custam nada à
 * navegação global, e uma promessa dessas só vale medida.
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
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
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

let pass = 0
let fail = 0
const ok = label => { pass += 1; console.log(`✅ ${label}`) }
const no = (label, detail = '') => { fail += 1; console.log(`❌ ${label}${detail ? `: ${detail}` : ''}`) }

if (!fs.existsSync('.next/BUILD_ID')) {
  console.error('Faltou `npm run build`.')
  process.exit(1)
}

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: process.env, stdio: 'ignore' })
const stopServer = () => { try { server.kill('SIGTERM') } catch {} }
process.on('exit', stopServer)

let up = false
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise(resolve => setTimeout(resolve, 500))
  up = await fetch(`${B}/auth/login`).then(r => r.status < 500).catch(() => false)
}
if (!up) {
  console.error('Servidor não subiu')
  stopServer()
  await finish(1)
}

const email = `eos-prep-${Date.now()}@test.internal`
const created = await admin('/auth/v1/admin/users', {
  method: 'POST',
  body: JSON.stringify({ email, password: PASS, email_confirm: true }),
}).then(r => r.json())
if (!created.id) {
  console.error('Falha criando usuário temporário', created)
  stopServer()
  await finish(1)
}
track.user(created.id)
await admin(`/rest/v1/profiles?id=eq.${created.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ name: 'Prep Test' }),
})

const browser = await chromium.launch({ args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'pt-BR' })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('eos-ficha-firstrun', '1')
      localStorage.setItem('eos-water-fema-standard-seen', 'seen')
    } catch {}
  })

  await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})

  // ── 1. A Visão continua sendo a porta ─────────────────────────────────────
  await page.goto(`${B}/preparedness`, { waitUntil: 'networkidle' })
  const navLocal = page.locator('nav[aria-label="Seções da Preparação"]')
  await navLocal.waitFor({ timeout: 20000 })
  ok('/preparedness abre com a navegação local')

  // ── 2. O chip ativo é o da rota atual ─────────────────────────────────────
  const atual = await navLocal.locator('[aria-current="page"]').innerText().catch(() => '')
  atual.trim() === 'Visão'
    ? ok('chip ativo na Visão é "Visão"')
    : no('chip ativo errado na Visão', atual)

  // ── 3. O chip navega de verdade (rota, não estado em memória) ─────────────
  await navLocal.locator('a', { hasText: 'O que falta' }).click()
  await page.waitForURL(/\/preparedness\/o-que-falta/, { timeout: 10000 }).catch(() => {})
  const foiParaSubtopico = page.url().includes('/preparedness/o-que-falta')
  foiParaSubtopico
    ? ok('chip navega para /preparedness/o-que-falta')
    : no('chip não navegou', page.url())

  // ── 4. O CRITÉRIO QUE MAIS IMPORTA ────────────────────────────────────────
  // A barra global não muda em sub-rota, e PREPARAÇÃO segue acesa. É a
  // propriedade que `docs/35` pediu para preservar: sub-rota de domínio não
  // custa nada à navegação global.
  const itensGlobais = await page.locator('nav.nav a').count()
  itensGlobais === 7
    ? ok('BottomNav continua com 7 destinos na sub-rota')
    : no('BottomNav mudou de tamanho na sub-rota', String(itensGlobais))

  const prepAceso = await page.locator('nav.nav a[aria-current="page"]').innerText().catch(() => '')
  prepAceso.trim() === 'Preparação'
    ? ok('PREPARAÇÃO segue acesa na sub-rota')
    : no('PREPARAÇÃO apagou na sub-rota', prepAceso)

  // ── 5. Voltar devolve à Visão, não ao domínio anterior ────────────────────
  await page.goBack()
  await page.waitForURL(/\/preparedness$/, { timeout: 10000 }).catch(() => {})
  const voltouParaVisao = new URL(page.url()).pathname === '/preparedness'
  voltouParaVisao
    ? ok('voltar do subtópico devolve à Visão')
    : no('voltar não devolveu à Visão', page.url())

  // ── 6. O endereço antigo não vira 404 ─────────────────────────────────────
  await page.goto(`${B}/checklist`, { waitUntil: 'networkidle' })
  const redirecionou = page.url().includes('/preparedness/o-que-falta')
  redirecionou
    ? ok('/checklist redireciona para o subtópico')
    : no('/checklist não redirecionou', page.url())

  // ── 7. Deep link direto funciona sem passar pela Visão ────────────────────
  await page.goto(`${B}/preparedness/o-que-falta`, { waitUntil: 'networkidle' })
  const navDireta = await page.locator('nav[aria-label="Seções da Preparação"] [aria-current="page"]').innerText().catch(() => '')
  navDireta.includes('falta')
    ? ok('deep link direto acende o chip certo')
    : no('deep link não acendeu o chip certo', navDireta)

  // ── 8. Semântica: navegação, não abas ─────────────────────────────────────
  // Sem painéis em memória, um `tablist` mentiria para o leitor de tela.
  const abasFalsas = await page.locator('nav[aria-label="Seções da Preparação"] [role="tab"]').count()
  abasFalsas === 0
    ? ok('a faixa usa navegação, não role="tab"')
    : no('a faixa está fingindo ser tablist', String(abasFalsas))
} catch (error) {
  no('erro inesperado', error.message)
} finally {
  await browser.close().catch(() => {})
  stopServer()
}

console.log(`\n${pass} passou · ${fail} falhou`)
await finish(fail ? 1 : 0)
