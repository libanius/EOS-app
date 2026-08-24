/**
 * A mesma pessoa em duas linhas (D-135).
 *
 * O app tem três portas para dizer quem mora na casa — o endereço da ficha, o
 * cadastro de dependente e o círculo — e elas não se conhecem. Quando alguém
 * entra por duas, a casa fica com duas linhas para uma cabeça.
 *
 * Está acontecendo em produção. Uma conta "Isadora da Rosa Libanio" tem um
 * dependente "Isadora": a casa conta 3 onde há 2, e a autonomia dela é dividida
 * por três — ela lê que está menos preparada do que está. E na conta do dono há
 * dois convites marcados como enviados para a Daniela e a Paola, que já moram
 * com ele há semanas: o app afirmava, para ele e para o Pilot, que as duas "não
 * estão no EOS".
 *
 * O que este teste prova:
 *
 *   1. um dependente parecido com uma conta da casa é APONTADO
 *   2. e NÃO é juntado sozinho                             ← a regra que protege
 *   3. juntar é um toque, e aí a casa encolhe de verdade
 *   4. juntar faz a autonomia SUBIR — e é por isso que o app não faz sozinho
 *   5. dois irmãos NÃO são apontados                       ← controle negativo
 *   6. o convite de quem já entrou se fecha sozinho
 *   7. o convite de quem não entrou continua aberto        ← controle negativo
 *
 * ATENÇÃO: cria e apaga contas no Supabase de produção.
 */
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })
import { track, cleanupOnExit, finish } from './lib/test-cleanup.mjs'

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3080)
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

let stopAll = () => {}
/** Semear em silêncio já fez um teste meu reprovar o produto por defeito do preparo. */
const semear = async (rota, corpo, oQueE) => {
  const r = await admin(rota, { method: 'POST', body: JSON.stringify(corpo) })
  if (r.ok) return r.json().catch(() => null)
  console.error(`\n[preparo] falhou ao criar ${oQueE}: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}\n`)
  stopAll()
  await finish(1)
  return null
}

import fs from 'node:fs'
import { spawn } from 'node:child_process'
if (!fs.existsSync('.next/BUILD_ID')) { console.error('Faltou `npm run build`.'); process.exit(1) }
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: process.env, stdio: 'ignore' })
const stopServer = () => { try { server.kill('SIGTERM') } catch {} }
stopAll = stopServer
process.on('exit', stopServer)
let up = false
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise(r => setTimeout(r, 500))
  up = await fetch(`${B}/auth/login`).then(r => r.status < 500).catch(() => false)
}
if (!up) { console.error('Servidor não subiu'); stopServer(); await finish(1) }

const criar = async (nome) => {
  const email = `eos-dup-${Date.now()}-${Math.abs(nome.length * 7919) % 997}@test.internal`
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
  track.user(u.id)
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: nome, location_lat: 26.31, location_lng: -80.2 }) })
  return { id: u.id, email, nome }
}

// ── A casa: o caso real da Isadora ─────────────────────────────────────────
const chefe = await criar('Chefe da Casa')
const isadora = await criar('Isadora da Rosa Libanio')

const circulo = await semear('/rest/v1/circles', {
  name: 'Casa Duplicada', leader_id: chefe.id, invite_code: Date.now().toString(36).slice(-6).toUpperCase(),
}, 'o círculo')
const circleId = circulo?.[0]?.id
if (!circleId) { console.error('círculo sem id'); stopServer(); await finish(1) }
track.circle(circleId)

await semear('/rest/v1/circle_members', [
  { circle_id: circleId, user_id: chefe.id, role: 'Admin', household_status: 'confirmed', share_inventory: true, family_access_status: 'approved' },
  { circle_id: circleId, user_id: isadora.id, role: 'Editor', household_status: 'confirmed', share_inventory: true, family_access_status: 'approved' },
], 'os membros do círculo')

// A duplicata: a Isadora foi cadastrada como dependente ANTES de ter conta.
const dep = await semear('/rest/v1/family_members', {
  profile_id: chefe.id, name: 'Isadora', age: 25, medical_conditions: ['ansiedade'],
  medications: [], mobility_impaired: false, is_infant: false,
}, 'a dependente duplicada')
const depId = dep?.[0]?.id

// O controle negativo: dois irmãos, mesmo sobrenome, primeiros nomes diferentes.
await semear('/rest/v1/family_members', {
  profile_id: chefe.id, name: 'Pedro da Rosa Libanio', age: 12, medical_conditions: [],
  medications: [], mobility_impaired: false, is_infant: false,
}, 'o irmão')

// Água só para dar um número de autonomia que se possa comparar.
await semear('/rest/v1/resource_inventory', {
  profile_id: chefe.id, water_liters: 120, food_days: 30, fuel_liters: 0, battery_percent: 50,
  has_medical_kit: true, has_communication_device: true,
}, 'o inventário')

// Convites: um de quem JÁ entrou, um de quem não.
await semear('/rest/v1/household_invites', [
  { owner_id: chefe.id, name: 'Isadora da Rosa Libanio', status: 'sent' },
  { owner_id: chefe.id, name: 'Tia Marlene Souza', status: 'pending' },
], 'os convites')

/*
 * A migration do `joined` está aplicada?
 *
 * Sem esta sonda o teste reprovaria o PRODUTO por uma migration que falta —
 * e foi exatamente o que aconteceu na primeira execução. Um teste que não
 * distingue "o código está errado" de "o banco está velho" manda consertar o
 * lugar errado.
 */
/*
 * A sonda precisa de uma LINHA DE VERDADE.
 *
 * A primeira versão fazia PATCH num id inexistente. Zero linhas casadas nunca
 * exercitam o CHECK: o PostgREST devolve 200 com `[]` e a sonda concluía que a
 * migration estava aplicada quando não estava. Foi o mesmo engano de sempre —
 * um caminho que passa sem testar nada.
 */
const cobaia = await semear('/rest/v1/household_invites', {
  owner_id: chefe.id, name: 'Sonda de Migration', status: 'pending',
}, 'a linha de sonda')
const cobaiaId = cobaia?.[0]?.id
const sondaJoined = await admin(`/rest/v1/household_invites?id=eq.${cobaiaId}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'joined' }),
})
const temJoined = sondaJoined.status < 400
await admin(`/rest/v1/household_invites?id=eq.${cobaiaId}`, { method: 'DELETE' })
if (!temJoined) {
  console.log('⚠️  `joined` ainda não existe no CHECK — aplique 20260808200000_invite_joined.sql.')
  console.log('    Os itens 6 e 7 (convites) não podem ser exercitados; o resto roda.\n')
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true })
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', chefe.email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})

const casa = async () => page.evaluate(async () => (await fetch('/api/household')).json())
const antes = await casa()

// ── 1. apontado ────────────────────────────────────────────────────────────
const apontada = (antes.duplicates ?? []).find(d => d.name === 'Isadora')
apontada && apontada.sameAsName?.includes('Isadora')
  ? ok('a duplicata é apontada', `"${apontada.name}" ≟ "${apontada.sameAsName}"`)
  : no('não apontou a duplicata', JSON.stringify(antes.duplicates))

// ── 2. e NÃO juntada sozinha ───────────────────────────────────────────────
/*
 * A regra que protege: juntar por engano tira uma boca da conta e faz a
 * autonomia SUBIR. A família leria que aguenta mais do que aguenta, e se
 * prepararia menos. Duplicar faz o contrário e não machuca ninguém.
 */
antes.size === 4
  ? ok('a casa NÃO junta sozinha', `size=${antes.size} (Chefe, Isadora conta, Isadora dep., Pedro)`)
  : no('a casa mexeu sozinha no número de pessoas', `size=${antes.size}`)

// ── 5. controle negativo: irmãos não são apontados ─────────────────────────
!(antes.duplicates ?? []).some(d => d.name.startsWith('Pedro'))
  ? ok('dois irmãos NÃO são apontados', 'sobrenome igual não é a mesma pessoa')
  : no('apontou dois irmãos como a mesma pessoa', JSON.stringify(antes.duplicates))

// ── 6 e 7. os convites ─────────────────────────────────────────────────────
const convites = await admin(`/rest/v1/household_invites?owner_id=eq.${chefe.id}&select=name,status`).then(r => r.json())
const daIsadora = convites.find(c => c.name.startsWith('Isadora'))
const daTia = convites.find(c => c.name.startsWith('Tia'))

if (temJoined) {
  daIsadora?.status === 'joined'
    ? ok('o convite de quem já entrou se fechou sozinho', `${daIsadora.name} → joined`)
    : no('o app ainda diz que ela não está no EOS', JSON.stringify(daIsadora))
} else {
  /*
   * Sem a migration, o certo é o convite CONTINUAR aberto — e o nome continuar
   * na lista de pendentes. A primeira versão do código sumia com o nome da tela
   * mesmo com a gravação falhando: a tela ficava certa e o banco errado, que é
   * o defeito que este conserto inteiro existe para eliminar.
   */
  daIsadora?.status === 'sent' && (antes.pendingNames ?? []).some(n => n.startsWith('Isadora'))
    ? ok('sem a migration, o convite não é dado como fechado na tela', 'a tela não mente sobre o banco')
    : no('a tela e o banco discordam sobre o convite', JSON.stringify({ daIsadora, pend: antes.pendingNames }))
}

daTia?.status === 'pending' && (antes.pendingNames ?? []).some(n => n.startsWith('Tia'))
  ? ok('o convite de quem NÃO entrou continua aberto', daTia.name)
  : no('fechou um convite que não devia', JSON.stringify({ daTia, pend: antes.pendingNames }))

// ── 3 e 4. juntar é um toque, e a autonomia sobe ───────────────────────────
const juntou = await page.evaluate(async ({ depId, sameAs }) => {
  const r = await fetch(`/api/family-members/${depId}/link`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linked_user_id: sameAs }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}, { depId, sameAs: isadora.id })

const depois = await casa()
juntou.status === 200 && depois.size === 3
  ? ok('juntar encolhe a casa de verdade', `${antes.size} → ${depois.size} pessoas`)
  : no('juntar não mudou a casa', `HTTP ${juntou.status} · size ${antes.size}→${depois.size}`)

/*
 * O número que explica a regra inteira. Menos uma boca = mais dias por cabeça.
 * Se o app juntasse sozinho e errasse, este é exatamente o movimento que ele
 * causaria — para cima, na direção que faz uma família se preparar menos.
 */
const subiu = (depois.autonomyDays ?? 0) > (antes.autonomyDays ?? 0)
subiu
  ? ok('juntar faz a autonomia SUBIR — por isso o app não faz sozinho', `${antes.autonomyDays?.toFixed(2)} → ${depois.autonomyDays?.toFixed(2)} dias`)
  : no('a autonomia não se moveu como o modelo prevê', `${antes.autonomyDays} → ${depois.autonomyDays}`)

// E o apontamento some depois de resolvido.
!(depois.duplicates ?? []).some(d => d.memberId === depId)
  ? ok('resolvida, a duplicata para de aparecer', `${(depois.duplicates ?? []).length} restante(s)`)
  : no('continua apontando o que já foi juntado', JSON.stringify(depois.duplicates))

await browser.close()
stopServer()
await admin(`/rest/v1/household_invites?owner_id=eq.${chefe.id}`, { method: 'DELETE' }).catch(() => {})
console.log(`\n${pass} passaram, ${fail} falharam`)
await finish(fail)
