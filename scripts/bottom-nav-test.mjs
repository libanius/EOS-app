/**
 * BottomNav regression test (D-139).
 *
 * Proves the app shell stays responsive from /dashboard and every bottom nav
 * icon changes URL. Creates a temporary confirmed Supabase user and deletes it.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
import { track, cleanupOnExit, finish } from './lib/test-cleanup.mjs'

config({ path: '.env.local' })

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3058)
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
  up = await fetch(`${B}/auth/login`).then(response => response.status < 500).catch(() => false)
}
if (!up) {
  console.error('Servidor não subiu')
  stopServer()
  await finish(1)
}

const email = `eos-nav-${Date.now()}@test.internal`
const created = await admin('/auth/v1/admin/users', {
  method: 'POST',
  body: JSON.stringify({ email, password: PASS, email_confirm: true }),
}).then(response => response.json())
if (!created.id) {
  console.error('Falha criando usuário temporário', created)
  stopServer()
  await finish(1)
}
track.user(created.id)
await admin(`/rest/v1/profiles?id=eq.${created.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ name: 'Nav Test' }),
})

const browser = await chromium.launch({ args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'pt-BR' })
  const consoleErrors = []
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.addInitScript(() => {
    try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {}
  })

  await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})

  await page.goto(`${B}/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForSelector('nav.nav a', { timeout: 20000 })
  await page.waitForTimeout(1200)

  const loopErrors = consoleErrors.filter(error => error.includes('Maximum update depth'))
  loopErrors.length === 0
    ? ok('dashboard não entra em loop de renderização')
    : no('dashboard entrou em loop de renderização', `${loopErrors.length} warnings`)

  /*
   * Os cinco destinos de NAV-T06 (D-180). Eram seis abas mais o orbe; Clima,
   * Círculos e Cenário perderam o slot e MAIS ganhou o dele.
   */
  const cases = [
    ['Família', /\/family/],
    ['Preparação', /\/preparedness/],
    ['Mundo', /\/dashboard/],
    ['Comms', /\/comms/],
    ['Mais', /\/mais/],
  ]

  for (const [label, expected] of cases) {
    /*
     * O MUNDO parte de /dashboard, então "navegar" para ele passaria de graça.
     * Ele é medido de outro lugar — e o que importa nele é estar ACESO.
     */
    const partida = label === 'Mundo' ? '/preparedness' : '/dashboard'
    await page.goto(`${B}${partida}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('nav.nav a', { timeout: 10000 })
    await page.locator('nav.nav a', { hasText: label }).first().click({ timeout: 5000 })
    await page.waitForURL(expected, { timeout: 7000 }).catch(() => {})
    expected.test(page.url())
      ? ok(`BottomNav navega para ${label}`)
      : no(`BottomNav não navegou para ${label}`, page.url())
  }

  // A barra tem CINCO destinos, e nem um a mais (NAV-T06 / D-180).
  await page.goto(`${B}/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForSelector('nav.nav a', { timeout: 10000 })
  const destinos = await page.locator('nav.nav a').count()
  destinos === 5
    ? ok('BottomNav tem 5 destinos')
    : no('BottomNav com contagem errada', String(destinos))

  // O ☰ não existe mais: era a segunda navegação, e invisível.
  const menuMorto = await page.locator('.app-actions-trigger').count()
  menuMorto === 0
    ? ok('o ☰ deixou de existir')
    : no('o ☰ ainda está na tela', String(menuMorto))

  // O endereço antigo de Configurações não pode virar 404 — é o caminho do
  // pagamento.
  await page.goto(`${B}/settings`, { waitUntil: 'networkidle' })
  page.url().includes('/mais')
    ? ok('/settings redireciona para /mais')
    : no('/settings não redirecionou', page.url())

  /*
   * A CHECAGEM QUE FALTOU EM D-180.
   *
   * Clima perdeu o ícone da barra, então a porta no MUNDO virou a única — e
   * ela era CONDICIONAL: só aparecia com alerta ativo. Quem está bem, que é
   * quase todo mundo quase sempre, ficava sem caminho nenhum.
   *
   * O usuário temporário não tem localização e portanto não tem alerta: este
   * teste roda exatamente no ramo que estava quebrado.
   */
  await page.goto(`${B}/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForSelector('nav.nav a', { timeout: 10000 })
  await page.waitForTimeout(1500)
  const portaClima = await page.locator('a[href="/dashboard/alertas"]').count()
  portaClima >= 1
    ? ok('o MUNDO tem porta para os Alertas mesmo SEM alerta ativo')
    : no('os Alertas ficaram órfãos: nenhuma porta no MUNDO', String(portaClima))

  const portaCenario = await page.locator('a[href="/scenario"]').count()
  portaCenario >= 1
    ? ok('o MUNDO tem porta para o Cenário')
    : no('o Cenário ficou órfão no MUNDO', String(portaCenario))

  // Clima e Cenário perderam o ícone, não o endereço.
  for (const rota of ['/weather', '/scenario']) {
    const resposta = await page.goto(`${B}${rota}`, { waitUntil: 'domcontentloaded' })
    const status = resposta?.status() ?? 0
    status !== 404
      ? ok(`${rota} continua alcançável por endereço`)
      : no(`${rota} virou 404`, String(status))
  }

  // ── NAV-T07 / D-182: Alertas desceu para dentro do MUNDO ──────────────────
  await page.goto(`${B}/weather`, { waitUntil: 'networkidle' })
  page.url().includes('/dashboard/alertas')
    ? ok('/weather redireciona para /dashboard/alertas')
    : no('/weather não redirecionou', page.url())

  /*
   * A faixa do MUNDO tem que existir AQUI, no ramo sem localização.
   *
   * O navegador de teste não concede GPS, então esta página cai no retorno
   * antecipado — o mesmo tipo de ramo que em NAV-T04 ficou sem navegação e
   * virou beco sem saída para quem tinha MENOS dado.
   */
  const faixaMundo = page.locator('nav[aria-label="Seções do Mundo"]')
  await faixaMundo.waitFor({ timeout: 20000 }).catch(() => {})
  const chipsMundo = await faixaMundo.locator('a').count()
  chipsMundo === 2
    ? ok('a faixa do Mundo aparece mesmo sem localização')
    : no('faixa do Mundo ausente ou com contagem errada', String(chipsMundo))

  const acesoMundo = await faixaMundo.locator('[aria-current="page"]').innerText().catch(() => '')
  acesoMundo.trim() === 'Alertas'
    ? ok('Alertas acende o próprio chip')
    : no('Alertas não acendeu', acesoMundo)

  // MUNDO segue aceso na barra global: sub-rota de domínio não custa nada à
  // navegação global.
  const globalAceso = await page.locator('nav.nav a[aria-current="page"]').innerText().catch(() => '')
  globalAceso.trim() === 'Mundo'
    ? ok('MUNDO segue aceso na sub-rota')
    : no('MUNDO apagou na sub-rota', globalAceso)

  // O chip "Mapa" devolve ao mapa — a volta tem nome, não é só o botão do SO.
  await faixaMundo.locator('a', { hasText: 'Mapa' }).click()
  await page.waitForURL(/\/dashboard$/, { timeout: 10000 }).catch(() => {})
  new URL(page.url()).pathname === '/dashboard'
    ? ok('o chip Mapa devolve ao mapa')
    : no('o chip Mapa não devolveu', page.url())
} finally {
  await browser.close().catch(() => {})
  stopServer()
}

await finish(fail ? 1 : 0)
