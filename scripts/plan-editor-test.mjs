/**
 * Editor do plano de voo, com dois navegadores de verdade (PLAN-T02/T04/T05).
 *
 * Prova as coisas que só falham quando duas pessoas usam ao mesmo tempo:
 *
 *   1. o plano não deixa salvar sem ponto de encontro e sem papel (doc 18 §3)
 *   2. o autor define um ponto pelo GPS, atribui um papel e salva a v1
 *   3. o outro membro ABRE e vê o plano — e vê o aviso de que precisa reconhecer
 *   4. reconhecer registra, e o autor passa a ver quem já viu (doc 18 §6.4)
 *   5. uma nova versão INVALIDA o reconhecimento antigo — quem já tinha visto
 *      volta para "ainda não viram", que é o ponto inteiro do versionamento
 *   6. sem rede, o plano continua na tela, rotulado como cópia local (doc 18 §13)
 *
 * O item 5 é o que separa um plano de um desenho: se um ack antigo fosse
 * carregado adiante, o autor acreditaria que a família viu uma mudança que
 * ninguém viu.
 *
 * Sobe e derruba o próprio `next start` — exige `npm run build` antes.
 *
 * ATENÇÃO: cria e apaga contas no Supabase de produção.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3011)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'
const HOME = { latitude: 26.3106, longitude: -80.2456 } // Parkland, FL

const admin = (p, o = {}) => fetch(`${URL}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

let pass = 0, fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

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
  up = await fetch(`${B}/plan`).then(r => r.status < 500).catch(() => false)
}
if (!up) { console.error(`Servidor não subiu em ${B}`); stopServer(); process.exit(1) }

async function mkUser(name) {
  const email = `eos-plan-${name}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
  return { id: u.id, email, name }
}

async function login(browser, user) {
  const ctx = await browser.newContext({
    viewport: { width: 420, height: 900 },
    locale: 'pt-BR',
    permissions: ['geolocation'],
    geolocation: HOME,
  })
  await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
  const page = await ctx.newPage()
  await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', user.email)
  await page.fill('input[type="password"]', PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha|onboarding/, { timeout: 30000 }).catch(() => {})
  return { page, ctx }
}

/** Define um ponto de encontro pelo GPS, no fluxo real do picker. */
async function setPoint(page, buttonText, name) {
  await page.locator(`button:has-text("${buttonText}")`).first().click()
  const dialog = page.locator('[role="dialog"][aria-label="Onde fica?"]')
  await dialog.waitFor({ timeout: 10000 })
  await dialog.locator('button:has-text("Usar minha posição")').click()
  await page.waitForTimeout(1500)
  await dialog.locator('input').first().waitFor()
  // O primeiro input do formulário é a busca; o nome é o campo do rótulo.
  await dialog.locator('label:has-text("Como a família chama") input').fill(name)
  await dialog.locator('button:has-text("Confirmar")').click()
  await dialog.waitFor({ state: 'detached', timeout: 10000 })
}

const author = await mkUser('autor')
const member = await mkUser('membro')
const circle = await admin('/rest/v1/circles', { method: 'POST', body: JSON.stringify({
  name: 'Plano Teste', leader_id: author.id,
  invite_code: Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6),
}) }).then(r => r.json())
await admin('/rest/v1/circle_members', { method: 'POST', body: JSON.stringify([
  { circle_id: circle[0].id, user_id: author.id, role: 'Admin', share_inventory: true, shared_fields: [] },
  { circle_id: circle[0].id, user_id: member.id, role: 'Editor', share_inventory: true, shared_fields: [] },
]) })
console.log('— duas contas num círculo\n')

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const { page: a } = await login(browser, author)

// ── 1. sem ponto e sem papel, não salva ──────────────────────────────────────
await a.goto(`${B}/plan`, { waitUntil: 'networkidle' })
await a.waitForTimeout(1500)
const saveBtn = a.locator('button:has-text("Salvar plano")')
const gapsShown = await a.locator('text=Falta para o plano ficar executável').count()
const disabled = await saveBtn.isDisabled().catch(() => null)
gapsShown && disabled
  ? ok('plano vazio não salva e diz o que falta')
  : no('plano vazio deixou salvar', `lacunas=${gapsShown} desabilitado=${disabled}`)

// ── 2. autor define ponto + papel e salva a v1 ───────────────────────────────
await setPoint(a, 'Definir', 'Portão da frente')
await a.locator('button:has-text("+ Adicionar")').first().click()
await a.locator('.wv2-plan-role input').first().fill('pega a Isadora na escola')
await a.waitForTimeout(300)
await saveBtn.click()
await a.waitForTimeout(4000)

const v1 = await admin(`/rest/v1/family_plans?circle_id=eq.${circle[0].id}&select=id,version`).then(r => r.json())
const wps = await admin(`/rest/v1/family_plan_waypoints?plan_id=eq.${v1?.[0]?.id}&select=kind,name`).then(r => r.json())
v1?.[0]?.version === 1 && wps?.some(w => w.kind === 'rendezvous_1' && w.name === 'Portão da frente')
  ? ok('autor salvou a v1 com ponto e papel', JSON.stringify(wps))
  : no('v1 não gravou', `${JSON.stringify(v1)} ${JSON.stringify(wps)}`)

// ── 3. o outro membro abre e é chamado a reconhecer ──────────────────────────
const { page: b, ctx: bctx } = await login(browser, member)
await b.goto(`${B}/plan`, { waitUntil: 'networkidle' })
await b.waitForTimeout(2000)
const seesPoint = await b.locator('text=Portão da frente').count()
const seesAck = await b.locator('text=O plano mudou').count()
seesPoint && seesAck
  ? ok('membro vê o plano e o aviso de reconhecimento')
  : no('membro não viu o plano/aviso', `ponto=${seesPoint} aviso=${seesAck}`)

// ── 4. reconhecer registra, e o autor enxerga quem viu ───────────────────────
await b.locator('button:has-text("Vi a mudança")').click()
await b.waitForTimeout(2500)
const acks = await admin(`/rest/v1/family_plan_acks?plan_id=eq.${v1?.[0]?.id}&select=member_user_id,acked_version`).then(r => r.json())
const memberAcked = acks?.some(x => x.member_user_id === member.id && x.acked_version === 1)

await a.reload({ waitUntil: 'networkidle' })
await a.waitForTimeout(2000)
const authorSees = await a.locator(`.wv2-plan-acks .wv2-chip.on:has-text("${member.name}")`).count()
memberAcked && authorSees
  ? ok('reconhecimento registrado e visível para o autor')
  : no('reconhecimento não fechou o ciclo', `banco=${memberAcked} tela=${authorSees}`)

// ── 5. nova versão invalida o reconhecimento antigo ──────────────────────────
await setPoint(a, 'Trocar', 'Praça do quarteirão')
await a.waitForTimeout(500)
await a.locator('button:has-text("Salvar plano")').click()
await a.waitForTimeout(4000)

const v2 = await admin(`/rest/v1/family_plans?circle_id=eq.${circle[0].id}&select=version`).then(r => r.json())
const stillOn = await a.locator(`.wv2-plan-acks .wv2-chip.on:has-text("${member.name}")`).count()
v2?.[0]?.version === 2 && stillOn === 0
  ? ok('v2 invalidou o reconhecimento da v1', `${member.name} voltou para "ainda não viram"`)
  : no('ack antigo foi carregado adiante', `versão=${v2?.[0]?.version} aindaMarcado=${stillOn}`)

// ── 6. sem rede, o plano continua legível (doc 18 §13) ───────────────────────
await b.reload({ waitUntil: 'networkidle' })
await b.waitForTimeout(2500)          // garante que a cópia local foi gravada
await bctx.setOffline(true)
await b.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await b.waitForTimeout(3500)
const offlineLabel = await b.locator('text=Cópia deste aparelho').count()
const offlinePoint = await b.locator('text=Praça do quarteirão').count()
offlineLabel && offlinePoint
  ? ok('sem rede: plano na tela, rotulado como cópia local')
  : no('plano não sobreviveu offline', `rótulo=${offlineLabel} ponto=${offlinePoint}`)
await bctx.setOffline(false)

// ─── limpeza ────────────────────────────────────────────────────────────────
await browser.close()
stopServer()
for (const u of [author, member]) {
  await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'DELETE' })
}
await admin(`/rest/v1/circles?id=eq.${circle[0].id}`, { method: 'DELETE' })

console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
