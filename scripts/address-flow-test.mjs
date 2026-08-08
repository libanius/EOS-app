/**
 * Do endereço até o convite (D-130).
 *
 * O fluxo que o dono descreveu: preenche o endereço completo, o app pergunta
 * quem mais mora ali, e no fim oferece criar o círculo.
 *
 * O que este teste prova, com o endereço real dele:
 *
 *   1. o endereço estruturado vira texto legível E ponto no mapa
 *   2. quem TEM celular vira convite pendente, não pessoa   ← o desenho inteiro
 *   3. quem NÃO tem vira dependente, com cuidador
 *   4. salvar duas vezes não duplica a lista                ← controle negativo
 *   5. dizer "agora não" não perde os nomes                 ← a razão da tabela
 *   6. criar o círculo amarra os convites a ele — SEM marcá-los como enviados
 *   7. quem cria o círculo passa a morar nele
 *   8. o Pilot recebe quem mora na casa e não está no EOS
 *
 * O item 6 tem uma sutileza que custou uma correção: a primeira versão marcava
 * `sent` ao criar o círculo. Nada tinha sido enviado — o convite deste app é um
 * link que a pessoa compartilha por onde quiser. Marcar como enviado o que
 * ninguém enviou faria a tela dizer que a Daniela foi convidada enquanto a
 * Daniela não recebeu nada.
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
const PORT = Number(process.env.PORT || 3070)
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

const email = `eos-addr-${Date.now()}@test.internal`
const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
track.user(u.id)
await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Paulo' }) })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})

/** O endereço real do dono, que é o caso que guia o desenho. */
const endereco = { country: 'US', line1: '5851 Holmberg Rd', unit: '4124', city: 'Parkland', region: 'FL', postal: '33067' }

const salvar = (moradores) => page.evaluate(async ({ endereco, moradores }) => {
  const r = await fetch('/api/household/address', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: endereco, residents: moradores }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}, { endereco, moradores })

// ── 1 a 3: o endereço e a bifurcação ───────────────────────────────────────
const r1 = await salvar([
  { name: 'Daniela Oliveira Letteriello', hasPhone: true },
  { name: 'Paola Letteriello Libanio', hasPhone: true },
  { name: 'Dona Ana', hasPhone: false },
])

const perfil = await admin(`/rest/v1/profiles?id=eq.${u.id}&select=location,address_unit,location_lat,location_lng`).then(r => r.json())
const p = perfil?.[0]
p?.location === '5851 Holmberg Rd, Unit 4124, Parkland, FL 33067' && p?.address_unit === '4124'
  ? ok('o endereço vira texto legível e guarda a unidade', p.location)
  : no('endereço não gravou', JSON.stringify(p))

p?.location_lat != null && p?.location_lng != null
  ? ok('o endereço virou ponto no mapa', `${Number(p.location_lat).toFixed(3)}, ${Number(p.location_lng).toFixed(3)}`)
  : no('sem coordenada — o geocodificador não respondeu', JSON.stringify(r1.body))

const convites = await admin(`/rest/v1/household_invites?owner_id=eq.${u.id}&select=name,status,circle_id`).then(r => r.json())
const deps = await admin(`/rest/v1/family_members?profile_id=eq.${u.id}&select=name`).then(r => r.json())

convites.length === 2 && convites.every(c => c.status === 'pending')
  ? ok('quem tem celular vira CONVITE, não pessoa', convites.map(c => c.name.split(' ')[0]).join(', '))
  : no('convites errados', JSON.stringify(convites))

deps.length === 1 && deps[0].name === 'Dona Ana'
  ? ok('quem não tem celular vira DEPENDENTE', deps[0].name)
  : no('dependente errado', JSON.stringify(deps))

// ── 4. controle negativo: salvar de novo não duplica ───────────────────────
await salvar([
  { name: 'Daniela Oliveira Letteriello', hasPhone: true },
  { name: 'Dona Ana', hasPhone: false },
])
const convites2 = await admin(`/rest/v1/household_invites?owner_id=eq.${u.id}&select=id`).then(r => r.json())
const deps2 = await admin(`/rest/v1/family_members?profile_id=eq.${u.id}&select=id`).then(r => r.json())
convites2.length === 2 && deps2.length === 1
  ? ok('salvar duas vezes não duplica a lista', `${convites2.length} convites, ${deps2.length} dependente`)
  : no('duplicou', `convites=${convites2.length} dependentes=${deps2.length}`)

// ── 5. "agora não": os nomes continuam lá ──────────────────────────────────
const pendentes = await page.evaluate(async () => (await fetch('/api/household/address')).json())
pendentes?.pending?.length === 2
  ? ok('dizer "agora não" não perde os nomes', `${pendentes.pending.length} esperando`)
  : no('os nomes se perderam', JSON.stringify(pendentes))

// ── 6 e 7: o círculo nasce ─────────────────────────────────────────────────
const criado = await page.evaluate(async () => {
  const r = await fetch('/api/circles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Casa Libânio' }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
})
if (criado.body?.circle?.id) track.circle(criado.body.circle.id)

const depois = await admin(`/rest/v1/household_invites?owner_id=eq.${u.id}&select=name,status,circle_id,sent_at`).then(r => r.json())
const amarrados = depois.filter(c => c.circle_id)
const aindaPendentes = depois.filter(c => c.status === 'pending' && !c.sent_at)
amarrados.length === 2 && aindaPendentes.length === 2
  ? ok('o círculo amarra os convites SEM dizer que foram enviados', 'ninguém mandou link nenhum ainda')
  : no('estado dos convites errado', JSON.stringify(depois))

const minhaLinha = await admin(`/rest/v1/circle_members?user_id=eq.${u.id}&select=household_status`).then(r => r.json())
minhaLinha?.[0]?.household_status === 'confirmed'
  ? ok('quem cria o círculo passa a morar nele', 'household_status=confirmed')
  : no('o criador ficou de fora da própria casa', JSON.stringify(minhaLinha))

// ── 8. o Pilot sabe quem falta ─────────────────────────────────────────────
const { getHousehold } = await import('../lib/household.ts').catch(() => ({}))
if (getHousehold) {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(URL_SB, KEY, { auth: { persistSession: false } })
  void sb
  const casa = await getHousehold(u.id)
  casa.pendingNames.length === 2 && casa.pendingNames.some(n => n.includes('Daniela'))
    ? ok('o Pilot recebe quem mora na casa e não está no EOS', casa.pendingNames.join(', '))
    : no('o Pilot não recebeu a lista', JSON.stringify(casa.pendingNames))
} else {
  no('não consegui checar o Pilot', 'rode com `npx tsx`')
}

await browser.close()
stopServer()
// A tabela some por cascata quando a conta é removida, mas limpar explícito é
// mais barato que confiar e descobrir depois.
await admin(`/rest/v1/household_invites?owner_id=eq.${u.id}`, { method: 'DELETE' }).catch(() => {})
console.log(`\n${pass} passaram, ${fail} falharam`)
await finish(fail)
