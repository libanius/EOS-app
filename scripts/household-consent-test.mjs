/**
 * Quem confirma que mora na casa é a própria pessoa (D-123, fase 2).
 *
 * Morar junto faz o inventário SOMAR e a autonomia mudar. Se a marcação fosse
 * unilateral, eu marcaria o vizinho e passaria a contar a água dele — o número
 * subiria sem nada ter mudado no mundo, e a família leria "seis dias" onde há
 * três.
 *
 * O que este teste prova, com navegador de verdade:
 *
 *   1. qualquer membro do círculo PEDE
 *   2. quem pediu NÃO consegue confirmar pelo outro   ← o controle que importa
 *   3. a própria pessoa confirma, e só então a casa cresce
 *   4. o inventário passa a somar no momento da confirmação
 *   5. sair desfaz, e a conta volta
 *   6. quem não está no círculo não mexe em nada       ← controle negativo
 *
 * O item 2 é a razão desta rota existir. Os outros cinco poderiam ser feitos no
 * banco; esse não — ele é sobre quem tem permissão de dizer o quê.
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
const PORT = Number(process.env.PORT || 3032)
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

const { getHousehold, autonomyDays } = await import('../lib/household.ts')

async function conta(nome) {
  const email = `eos-cons-${nome}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
  track.user(u.id)
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: nome }) })
  return { id: u.id, email, nome }
}

const ana = await conta('Ana')
const bruno = await conta('Bruno')
const zeca = await conta('Zeca')   // fora do círculo, de propósito

const despensa = (id, agua, dias) =>
  admin('/rest/v1/resource_inventory', { method: 'POST', body: JSON.stringify({
    profile_id: id, water_liters: agua, food_days: dias, fuel_liters: 0,
    battery_percent: 50, has_medical_kit: false, has_communication_device: false, cash_amount: 0,
  }) })
await despensa(ana.id, 30, 4)
await despensa(bruno.id, 60, 6)

const circulo = await admin('/rest/v1/circles', { method: 'POST', body: JSON.stringify({
  name: 'Casa Consentimento', leader_id: ana.id,
  invite_code: Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6),
}) }).then(r => r.json())
track.circle(circulo[0]?.id)
const cid = circulo[0].id
await admin('/rest/v1/circle_members', { method: 'POST', body: JSON.stringify([
  { circle_id: cid, user_id: ana.id, role: 'Admin', share_inventory: true, shared_fields: [] },
  { circle_id: cid, user_id: bruno.id, role: 'Editor', share_inventory: true, shared_fields: [] },
]) })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
async function entrar(user) {
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

const chamar = (page, circleId, body) =>
  page.evaluate(async ({ circleId, body }) => {
    const r = await fetch(`/api/circles/${circleId}/household`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }, { circleId, body })

const paginaAna = await entrar(ana)
const paginaBruno = await entrar(bruno)
const paginaZeca = await entrar(zeca)

// ── 1. qualquer membro pede ─────────────────────────────────────────────────
const pedido = await chamar(paginaAna, cid, { action: 'pedir', userId: bruno.id })
const linhaBruno = await admin(`/rest/v1/circle_members?circle_id=eq.${cid}&user_id=eq.${bruno.id}&select=household_status`).then(r => r.json())
pedido.status === 200 && linhaBruno?.[0]?.household_status === 'requested'
  ? ok('um membro do círculo pode PEDIR', `estado=${linhaBruno[0].household_status}`)
  : no('o pedido não foi registrado', `${JSON.stringify(pedido)} banco=${JSON.stringify(linhaBruno)}`)

// ── 2. CONTROLE NEGATIVO: quem pediu não confirma pelo outro ────────────────
const tentativa = await chamar(paginaAna, cid, { action: 'confirmar', userId: bruno.id })
const aindaPedido = await admin(`/rest/v1/circle_members?circle_id=eq.${cid}&user_id=eq.${bruno.id}&select=household_status`).then(r => r.json())
tentativa.status === 403 && aindaPedido?.[0]?.household_status === 'requested'
  ? ok('quem pediu NÃO confirma pela outra pessoa', `HTTP 403 · estado segue "${aindaPedido[0].household_status}"`)
  : no('alguém pôde confirmar pelos outros — a água do vizinho entraria na conta', `status=${tentativa.status} estado=${JSON.stringify(aindaPedido)}`)

// ── antes de confirmar, a casa da Ana é só ela ──────────────────────────────
const casaAntes = await getHousehold(ana.id)
const autonomiaAntes = autonomyDays(casaAntes.inventory, casaAntes.size)

// ── 3 e 4. a própria pessoa confirma, e a casa cresce ───────────────────────
const confirmou = await chamar(paginaBruno, cid, { action: 'confirmar' })
// Ana também precisa se declarar da casa, senão ela não faz parte de casa nenhuma.
await chamar(paginaAna, cid, { action: 'confirmar' })
const casaDepois = await getHousehold(ana.id)
const autonomiaDepois = autonomyDays(casaDepois.inventory, casaDepois.size)

confirmou.status === 200 && casaDepois.size === 2 && casaAntes.size === 1
  ? ok('a casa só cresce quando a própria pessoa confirma', `${casaAntes.size} → ${casaDepois.size} pessoas`)
  : no('a casa não acompanhou a confirmação', `antes=${casaAntes.size} depois=${casaDepois.size} http=${confirmou.status}`)

casaDepois.inventory.waterLiters === 90 && casaDepois.inventory.contributors === 2
  ? ok('o inventário passa a somar na confirmação', `${casaDepois.inventory.waterLiters} L de ${casaDepois.inventory.contributors} despensas · autonomia ${autonomiaAntes.toFixed(2)} → ${autonomiaDepois.toFixed(2)} dias`)
  : no('a despensa não somou', `água=${casaDepois.inventory.waterLiters} contribuintes=${casaDepois.inventory.contributors}`)

// ── 6. CONTROLE NEGATIVO: quem está fora do círculo não mexe ────────────────
const intruso = await chamar(paginaZeca, cid, { action: 'pedir', userId: bruno.id })
const intacto = await admin(`/rest/v1/circle_members?circle_id=eq.${cid}&user_id=eq.${bruno.id}&select=household_status`).then(r => r.json())
intruso.status === 403 && intacto?.[0]?.household_status === 'confirmed'
  ? ok('quem não está no círculo não mexe na casa', 'HTTP 403 e nada mudou')
  : no('autorização furada', `status=${intruso.status} estado=${JSON.stringify(intacto)}`)

// ── 5. sair desfaz, e a conta volta ─────────────────────────────────────────
await chamar(paginaBruno, cid, { action: 'sair' })
const casaFinal = await getHousehold(ana.id)
casaFinal.size === 1 && casaFinal.inventory.waterLiters === 30
  ? ok('sair da casa desfaz a soma', `${casaFinal.size} pessoa, ${casaFinal.inventory.waterLiters} L`)
  : no('sair não desfez', `size=${casaFinal.size} água=${casaFinal.inventory.waterLiters}`)

await browser.close()
stopServer()
console.log(`\n${pass} passaram, ${fail} falharam`)
await finish(fail)
