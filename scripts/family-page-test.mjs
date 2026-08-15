/**
 * A aba Família reconstruída (D-082).
 *
 * A antiga era cadastro: todos os dados certos, nenhuma pergunta respondida. A
 * nova responde três, e o teste cobre exatamente essas três:
 *
 *   1. ONDE ESTÁ CADA UM — posição e há quanto tempo ela é verdade
 *   2. QUEM NÃO ESTÁ COBERTO — e POR QUÊ, dito na cara em vez de a pessoa sumir
 *   3. QUEM FAZ O QUÊ — o papel do plano aparece junto da pessoa
 *
 * O item 2 é o que separa esta tela de um cadastro bonito: omitir quem não tem
 * conta faria a família acreditar que está toda coberta.
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
const PORT = Number(process.env.PORT || 3023)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'
const HOME = { latitude: 26.3106, longitude: -80.2456 }

const admin = (p, o = {}) => fetch(`${URL}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

// D-114: a limpeza acontece em QUALQUER saída — inclusive quando uma asserção
// estoura no meio. Foi o "só limpa no fim" que deixou 32 contas de teste no
// banco de produção.
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
  up = await fetch(`${B}/family`).then(r => r.status < 500).catch(() => false)
}
if (!up) { console.error('Servidor não subiu'); stopServer(); process.exit(1) }

async function mkUser(name) {
  const email = `eos-fam-${name}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name,
      location_lat: HOME.latitude,
      location_lng: HOME.longitude,
      last_location_lat: HOME.latitude + 0.01,
      last_location_lng: HOME.longitude + 0.01,
      last_location_at: new Date().toISOString(),
    }),
  })
  track.user(u.id)
  return { id: u.id, email, name }
}

const eu = await mkUser('Paulo')
const esposa = await mkUser('Daniela')
const circle = await admin('/rest/v1/circles', { method: 'POST', body: JSON.stringify({
  name: 'Família Teste', leader_id: eu.id,
  invite_code: Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6),
}) }).then(r => r.json())
track.circle(circle[0]?.id)
await admin('/rest/v1/circle_members', { method: 'POST', body: JSON.stringify([
  { circle_id: circle[0].id, user_id: eu.id, role: 'Admin', share_inventory: true, shared_fields: ['location'] },
  { circle_id: circle[0].id, user_id: esposa.id, role: 'Editor', share_inventory: true, shared_fields: ['location'] },
]) })

// Roster: a esposa LIGADA à conta, e uma filha SEM conta — o caso que a tela
// precisa explicar em vez de esconder.
await admin('/rest/v1/family_members', { method: 'POST', body: JSON.stringify([
  { profile_id: eu.id, name: 'Daniela', age: 38, medications: ['Losartana'], medical_conditions: [], mobility_impaired: false, is_infant: false, linked_user_id: esposa.id },
  { profile_id: eu.id, name: 'Isadora', age: 8, medications: [], medical_conditions: ['asma'], mobility_impaired: false, is_infant: false, linked_user_id: null },
]) })

// Um papel no plano: "quem busca quem" é o que se executa sem discutir.
const plan = await admin('/rest/v1/family_plans', { method: 'POST', body: JSON.stringify({
  circle_id: circle[0].id, name: 'Plano', status: 'active', created_by: eu.id, version: 1,
}) }).then(r => r.json())
await admin('/rest/v1/family_plan_roles', { method: 'POST', body: JSON.stringify([
  { plan_id: plan[0].id, member_user_id: esposa.id, responsibility: 'pega a Isadora na escola' },
]) })
console.log('— círculo com 2 contas, 1 filha sem conta, 1 papel no plano\n')

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  viewport: { width: 420, height: 900 }, locale: 'pt-BR',
  permissions: ['geolocation'], geolocation: HOME,
})
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', eu.email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding/, { timeout: 30000 }).catch(() => {})
await page.goto(`${B}/family`, { waitUntil: 'networkidle' })
await page.locator('.family-person').first().waitFor({ timeout: 30000 })
await page.waitForTimeout(2500)

const texto = await page.locator('.family-scroll').innerText()

/**
 * Localiza o cartão pelo TÍTULO, não pelo texto inteiro.
 *
 * Buscar "Isadora" em qualquer lugar do cartão casava também o da Daniela, cujo
 * papel é "pega a Isadora na escola" — dois elementos, e o Playwright recusa. O
 * teste então reportava "a pessoa sumiu" enquanto ela estava na tela.
 */
const cartao = nome =>
  page.locator('.family-person').filter({ has: page.locator('.id strong', { hasText: new RegExp(`^${nome}$`) }) })

// ── 1. onde está cada um ────────────────────────────────────────────────────
const daniela = await cartao('Daniela').innerText().catch(() => '')
const temFrescor = /agora|há \d+ (min|h|d)|perfil/i.test(daniela)
const temDistancia = /\d+([.,]\d+)?\s*(m|km)\b/i.test(daniela)
temFrescor && temDistancia
  ? ok('mostra onde a pessoa está e há quanto tempo', daniela.split('\n').slice(0, 3).join(' · '))
  : no('posição ou frescor ausentes', `frescor=${temFrescor} distancia=${temDistancia} · ${daniela.slice(0, 120).replace(/\n+/g, ' ')}`)

// ── 2. quem não está coberto, e por quê ─────────────────────────────────────
const isadora = await cartao('Isadora').innerText().catch(() => '')
const apareceu = isadora.length > 0
const explicou = /sem conta|não aparece no mapa/i.test(isadora)
apareceu && explicou
  ? ok('quem não tem conta aparece E a tela diz por que não está no mapa')
  : no('pessoa sem conta sumiu ou não foi explicada', `apareceu=${apareceu} explicou=${explicou} · ${isadora.slice(0, 120).replace(/\n+/g, ' ')}`)

// ── 3. quem faz o quê ───────────────────────────────────────────────────────
const temPapel = /pega a Isadora na escola/i.test(daniela)
temPapel
  ? ok('o papel do plano aparece junto da pessoa', 'pega a Isadora na escola')
  : no('papel do plano não chegou à pessoa', daniela.slice(0, 140).replace(/\n+/g, ' '))

// ── 4. necessidade que muda a decisão ───────────────────────────────────────
const temNecessidade = /Losartana/i.test(texto) && /Medicação contínua|asma|Condição médica/i.test(texto)
temNecessidade
  ? ok('necessidades que mudam a decisão estão na tela', 'medicação e condição médica')
  : no('necessidades ausentes', texto.slice(0, 160).replace(/\n+/g, ' '))

/*
 * ── 5. O PING CHEGA MESMO SEM PUSH (FAM-T09 / D-186) ───────────────────────
 *
 * Achado do dono: tocar "Onde você está?" respondia **"Não entregou"**.
 *
 * O ping era só push. Sem push — permissão revogada, assinatura expirada,
 * iPhone fora da PWA instalada — a mensagem não existia em lugar nenhum: nem
 * na caixa, nem na linha do tempo, nem ao abrir o app.
 *
 * O navegador de teste NÃO tem assinatura de push, então este teste roda
 * exatamente no caminho em que a mensagem sumia. O que ele exige é que ela
 * exista no banco de qualquer jeito.
 */
await cartao('Daniela').locator('button', { hasText: 'Onde você está?' }).click()
await page.waitForTimeout(2500)

const notificacoes = await admin(
  `/rest/v1/circle_notifications?recipient_id=eq.${esposa.id}&kind=eq.family_ping&select=title,body,metadata`,
).then(r => r.json()).catch(() => [])

Array.isArray(notificacoes) && notificacoes.length > 0
  ? ok('o ping VIRA REGISTRO mesmo sem push', notificacoes[0]?.body ?? '')
  : no('o ping sumiu: sem push, a mensagem não existe', JSON.stringify(notificacoes).slice(0, 140))

// E a tela não pode dizer que falhou quando a mensagem chegou.
const retorno = await cartao('Daniela').innerText().catch(() => '')
!/Não entregou/i.test(retorno) && /Enviado/i.test(retorno)
  ? ok('a tela diz a verdade sobre o que aconteceu', retorno.split('\n').find(l => /Enviado/i.test(l)) ?? '')
  : no('a tela mentiu sobre a entrega', retorno.slice(0, 160).replace(/\n+/g, ' '))

/*
 * A superfície do ping mudou em D-189, e a mudança é deliberada.
 *
 * D-186 pôs o ping em `family` argumentando que era "sobre gente, não sobre
 * conversa". Aquilo era verdade quando o ping NÃO TINHA conversa: ele chegava
 * e acabava ali, sem onde responder.
 *
 * Agora ele vira mensagem na conversa direta, e o badge tem que apontar para
 * onde a AÇÃO acontece — responder. Badge em Família levaria a uma tela onde
 * não dá para responder nada.
 */
const superficie = notificacoes[0]?.metadata?.surface
superficie === 'comms'
  ? ok('o ping cai na superfície Comms, onde dá para responder')
  : no('superfície errada para o ping', String(superficie))

/*
 * ── 6. O cadastro continua alcançável ──────────────────────────────────────
 *
 * Esta checagem exigia um link para `/family-legacy` — e **D-122 removeu esse
 * link de propósito**, em 2026-08-04: a ação principal da aba levava a uma tela
 * de outro app. O cadastro virou `/family/cadastro`, e em NAV-T05 ganhou chip
 * próprio na faixa de Família.
 *
 * A checagem ficou vermelha por dez dias medindo uma promessa revogada. O que
 * importa continua sendo o mesmo: **o cadastro não pode ficar inalcançável.**
 */
const chipCadastro = await page.locator('nav[aria-label="Seções da Família"] a[href="/family/cadastro"]').count()
const rotaAntiga = await fetch(`${B}/family-legacy`).then(r => r.status < 400).catch(() => false)
chipCadastro > 0 && rotaAntiga
  ? ok('o cadastro é chip da Família e o endereço antigo não virou 404', '/family/cadastro')
  : no('cadastro inalcançável', `chip=${chipCadastro} rotaAntiga=${rotaAntiga}`)

/*
 * ── 7. A FOLHA DA PESSOA NO MAPA RESPONDE AO TOQUE (D-187) ─────────────────
 *
 * Achado do dono: "por que está tudo embaçado? não consigo mais clicar."
 *
 * A folha reusava `.wv2-pilot-scrim`. Em 09/08 aquele scrim subiu para z-899
 * para passar por cima da barra de navegação — correto para o Pilot, que é
 * montado no layout. Errado aqui: esta folha vive dentro de `.wv2`, que é
 * `position: fixed` e cria contexto de empilhamento próprio. Ali dentro, 899
 * não competia com a barra e sim com a folha (7) — e a cobria.
 *
 * O `click` do Playwright é o teste exato: ele RECUSA clicar num elemento que
 * outro intercepta, e diz qual. Um teste que só medisse visibilidade passaria,
 * porque a folha estava visível — embaçada, mas visível.
 */
await page.goto(`${B}/dashboard`, { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)

const marcador = page.locator('.w-mapmarker.real').first()
const temMarcador = await marcador.count()
if (!temMarcador) {
  no('o rosto da pessoa não apareceu no mapa')
} else {
  await marcador.click()
  const folha = page.locator('.wv2-member')
  await folha.waitFor({ timeout: 10000 }).catch(() => {})

  const botao = folha.locator('button', { hasText: 'Onde você está?' }).first()
  const clicou = await botao.click({ timeout: 5000 }).then(() => true).catch(e => String(e.message || e))
  clicou === true
    ? ok('os botões da folha da pessoa respondem ao toque')
    : no('algo cobre a folha e intercepta o toque', String(clicou).split('\n')[0].slice(0, 120))

  // E o scrim tem que ser o DELA, não o do Pilot — a classe compartilhada é a
  // origem do defeito, e voltar a compartilhá-la o traz de volta.
  const scrimProprio = await page.locator('.wv2-member-scrim').count()
  const scrimDoPilot = await page.locator('.wv2-pilot-scrim').count()
  scrimProprio === 1 && scrimDoPilot === 0
    ? ok('a folha usa o próprio scrim, não o do Pilot')
    : no('scrim compartilhado de volta', `proprio=${scrimProprio} pilot=${scrimDoPilot}`)
}

await browser.close()
stopServer()
await admin(`/rest/v1/circle_notifications?recipient_id=eq.${esposa.id}`, { method: 'DELETE' })
await admin(`/rest/v1/family_members?profile_id=eq.${eu.id}`, { method: 'DELETE' })
for (const u of [eu, esposa]) {
  await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'DELETE' })
}
await admin(`/rest/v1/circles?id=eq.${circle[0].id}`, { method: 'DELETE' })

console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
