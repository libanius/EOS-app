/**
 * Cadastro da família reconstruído (D-122).
 *
 * A tela antiga não era uma página esquecida: era para onde a aba Família
 * mandava o usuário em "Cadastrar" e "Editar cadastro" — a ação primária da
 * aba levava a um aplicativo visualmente diferente, sem caminho de volta.
 *
 * O que este teste prova:
 *
 *   1. a rota antiga não abandona ninguém (redireciona)
 *   2. a aba Família leva para a tela nova, não para a antiga
 *   3. a tela nova está no design system      ← controle negativo (§)
 *   4. existe caminho de volta, e ele volta   ← a antiga prendia o usuário
 *   5. cadastrar uma pessoa pela interface grava no banco
 *   6. "o que falta" é dito, e some quando deixa de faltar
 *
 * (§) O item 3 é o controle negativo que importa: não basta a tela nova
 * existir, a antiga não pode ter sobrado em lugar nenhum. Ele procura pelas
 * marcas registradas da tela velha — o verde #0DE864, o `clip-path` em
 * paralelogramo e a pílula "CONNECTED" que não media conexão nenhuma.
 *
 * ATENÇÃO: cria e apaga uma conta no Supabase de produção.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })
import { track, cleanupOnExit, finish } from './lib/test-cleanup.mjs'

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3029)
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

const email = `eos-roster-${Date.now()}@test.internal`
const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
track.user(u.id)
await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Roster' }) })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()

// Um `alert()` bloqueia o navegador e é diálogo do sistema, não do produto.
// A tela antiga usava dois. Se algum aparecer, o teste registra.
let alertas = 0
page.on('dialog', async d => { alertas += 1; await d.dismiss() })

await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})

// ── 1. a rota antiga não abandona ninguém ───────────────────────────────────
await page.goto(`${B}/family-legacy`, { waitUntil: 'networkidle' })
const destino = new URL(page.url()).pathname
destino === '/family/cadastro'
  ? ok('rota antiga redireciona em vez de dar 404', `/family-legacy → ${destino}`)
  : no('rota antiga não redireciona', `foi parar em ${destino}`)

// ── 3. controle negativo: a tela velha não sobrou ───────────────────────────
const marcas = await page.evaluate(() => {
  const achados = []
  for (const el of Array.from(document.querySelectorAll('*'))) {
    const cs = getComputedStyle(el)
    // O verde neon da tela antiga, em qualquer propriedade que pinte.
    const tinta = `${cs.color} ${cs.backgroundColor} ${cs.borderColor} ${cs.boxShadow}`
    if (/rgb\(13,\s*232,\s*100\)/.test(tinta)) achados.push('verde #0DE864')
    if (cs.clipPath && cs.clipPath.includes('polygon')) achados.push('botão em paralelogramo')
  }
  const txt = document.body.innerText
  if (/CONNECTED/i.test(txt)) achados.push('pílula "CONNECTED"')
  if (/Family Grid/i.test(txt)) achados.push('"Family Grid"')
  if (/SECURITY SCORE/i.test(txt)) achados.push('"SECURITY SCORE"')
  return Array.from(new Set(achados))
})
marcas.length === 0
  ? ok('nenhuma marca da tela antiga sobrou', 'sem neon, sem paralelogramo, sem CONNECTED')
  : no('a tela antiga ainda aparece', marcas.join(', '))

// A tela está mesmo dentro do design system?
const dentro = await page.locator('main.wv2.wv2-roster-page').count()
dentro === 1
  ? ok('tela nova usa o design system do app', 'main.wv2.wv2-roster-page')
  : no('tela fora do design system', `encontrados=${dentro}`)

// ── 4. existe caminho de volta, e ele volta ─────────────────────────────────
const voltar = page.locator('.roster-back')
if (await voltar.count() === 1) {
  await voltar.click()
  await page.waitForURL(/\/family$/, { timeout: 10000 }).catch(() => {})
  new URL(page.url()).pathname === '/family'
    ? ok('o caminho de volta existe e volta para Família')
    : no('o botão voltar não voltou', page.url())
} else {
  no('não há caminho de volta — o usuário fica preso', `encontrados=${await voltar.count()}`)
}

// ── 2. a aba Família leva para a tela nova ──────────────────────────────────
await page.goto(`${B}/family`, { waitUntil: 'networkidle' })
const hrefs = await page.locator('a[href*="cadastro"], a[href*="legacy"]').evaluateAll(
  els => els.map(e => e.getAttribute('href')),
)
hrefs.length > 0 && hrefs.every(h => h === '/family/cadastro')
  ? ok('a aba Família aponta para a tela nova', hrefs.join(' '))
  : no('a aba Família ainda manda para a tela antiga', JSON.stringify(hrefs))

// ── 5. cadastrar pela interface grava no banco ──────────────────────────────
await page.goto(`${B}/family/cadastro`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Adicionar pessoa/i }).first().click()
await page.locator('.roster-sheet').waitFor({ timeout: 8000 })
await page.locator('.roster-sheet input.roster-input').first().fill('Isadora Teste')
// Sem idade de propósito: é assim que se prova o item 6.
await page.locator('.roster-sheet .roster-textarea').fill('asma leve, usa bombinha no inverno')
await page.getByRole('button', { name: /^Cadastrar$/ }).click()
await page.locator('.roster-sheet').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
await page.waitForTimeout(1200)

const noBanco = await admin(`/rest/v1/family_members?profile_id=eq.${u.id}&select=name,age,medical_notes`).then(r => r.json())
const gravou = Array.isArray(noBanco) && noBanco.some(m => m.name === 'Isadora Teste')
gravou
  ? ok('cadastrar pela interface grava no banco', `${noBanco.length} registro(s)`)
  : no('o cadastro não chegou ao banco', JSON.stringify(noBanco).slice(0, 200))

// ── 6. "o que falta" é dito, e some quando deixa de faltar ──────────────────
const cartao = page.locator('.roster-person').filter({ hasText: 'Isadora Teste' })
const avisoAntes = await cartao.locator('.warn').first().innerText().catch(() => '')
// O `const` não é estilo: uma linha começando com `/` depois de `)` é lida
// como DIVISÃO pelo JavaScript. Foi a terceira vez nesta base de código, e é
// por isso que o lint passou a cobrir `scripts/` (D-122).
const dizIdade = /idade/i.test(avisoAntes)
dizIdade
  ? ok('a tela diz o que falta na pessoa', `"${avisoAntes.trim()}"`)
  : no('a tela não avisa a informação faltando', `texto="${avisoAntes}"`)

await cartao.getByRole('button', { name: /^Editar$/ }).click()
await page.locator('.roster-sheet').waitFor({ timeout: 8000 })
// O stepper aceita digitação: tocar no número abre a entrada direta.
await page.locator('.roster-sheet').getByRole('button', { name: /aumentar|\+/i }).first().click({ clickCount: 8 }).catch(async () => {
  await page.locator('.roster-sheet [role="spinbutton"], .roster-sheet input[type="number"]').first().fill('8')
})
await page.getByRole('button', { name: /^Salvar$/ }).click()
await page.locator('.roster-sheet').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
await page.waitForTimeout(1200)

const depois = await admin(`/rest/v1/family_members?profile_id=eq.${u.id}&select=name,age`).then(r => r.json())
const comIdade = (depois ?? []).find(m => m.name === 'Isadora Teste')
const avisoDepois = await cartao.locator('.warn').count()
comIdade?.age > 0 && avisoDepois === 0
  ? ok('preenchida a idade, o aviso some', `idade=${comIdade.age} avisos=${avisoDepois}`)
  : no('o aviso não acompanhou o dado', `idade=${comIdade?.age ?? 'null'} avisos=${avisoDepois}`)

// ── controle negativo: nenhum diálogo do navegador ──────────────────────────
alertas === 0
  ? ok('nenhum alert() do navegador', 'erro é dito na própria tela')
  : no('ainda usa diálogo do sistema', `${alertas} alert(s)`)

await browser.close()
stopServer()
console.log(`\n${pass} passaram, ${fail} falharam`)
await finish(fail)
