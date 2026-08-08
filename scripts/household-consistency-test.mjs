/**
 * Uma casa, um número (D-134).
 *
 * A queixa do dono foi "o Pilot insiste em não saber quem está morando em casa"
 * e "as informações não estão batendo". A causa não era dado faltando: era o
 * app respondendo a mesma pergunta de dois jeitos.
 *
 * Na conta dele, ao mesmo tempo:
 *   `/api/household`   dizia 3 pessoas (ele, Daniela, Paola — confirmados)
 *   o painel do Mundo  dizia 1 (contava `family_members`, que estava vazia)
 *   o prompt do Pilot  levava as DUAS coisas, a três linhas de distância
 *
 * Um modelo que recebe duas respostas para a mesma pergunta não escolhe uma:
 * ele para de afirmar.
 *
 * Este teste monta uma casa de verdade — duas contas que confirmam morar
 * juntas, mais um dependente — e exige que TODA superfície diga o mesmo:
 *
 *   1. `/api/household` conta as três pessoas
 *   2. o painel do Mundo mostra a mesma autonomia que a Preparação
 *   3. o painel soma a despensa de QUEM MORA JUNTO, não só a minha
 *   4. o prompt do Pilot não contém dois números de pessoas   ← a causa raiz
 *   5. o Pilot afirma quem mora na casa quando perguntado
 *   6. sem a casa montada, ninguém inventa um número          ← controle negativo
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
const PORT = Number(process.env.PORT || 3078)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'

const admin = (p, o = {}) => fetch(`${URL_SB}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

cleanupOnExit(admin)

/**
 * Semear em silêncio é como este teste mentiu na primeira execução.
 *
 * Os `insert` do preparo não checavam resposta. Dois falharam — o dependente e
 * o inventário — e o teste reprovou o PRODUTO por um defeito do próprio
 * preparo. Já aconteceu antes neste repositório, com um `PGRST102`.
 */
const semear = async (rota, corpo, oQueE) => {
  const r = await admin(rota, { method: 'POST', body: JSON.stringify(corpo) })
  if (r.ok) return r.json().catch(() => null)
  const detalhe = await r.text().catch(() => '')
  console.error(`\n[preparo] falhou ao criar ${oQueE}: HTTP ${r.status} ${detalhe.slice(0, 200)}\n`)
  stopAll()
  await finish(1)
  return null
}
let stopAll = () => {}

let pass = 0, fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

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
  const email = `eos-cons-${nome}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
  track.user(u.id)
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: nome, location_lat: 26.31, location_lng: -80.2 }) })
  return { id: u.id, email }
}

// ── A casa: duas contas que moram juntas, mais uma dependente ──────────────
const chefe = await criar('Chefe')
const parceira = await criar('Parceira')

const circulo = await semear(
  '/rest/v1/circles',
  { name: 'Casa de Teste', leader_id: chefe.id, invite_code: Date.now().toString(36).slice(-6).toUpperCase() },
  'o círculo',
)
const circleId = circulo?.[0]?.id
if (!circleId) { console.error('círculo sem id', JSON.stringify(circulo)); stopServer(); await finish(1) }
track.circle(circleId)

await semear('/rest/v1/circle_members', [
  { circle_id: circleId, user_id: chefe.id, role: 'Admin', household_status: 'confirmed', share_inventory: true, family_access_status: 'approved' },
  { circle_id: circleId, user_id: parceira.id, role: 'Editor', household_status: 'confirmed', share_inventory: true, family_access_status: 'approved' },
], 'os membros do círculo')

await semear('/rest/v1/family_members', {
  profile_id: chefe.id, name: 'Avó Ana', age: 78, medical_conditions: ['hipertensão'],
  medications: [], mobility_impaired: true, is_infant: false,
}, 'a dependente')

/*
 * A despensa fica com a PARCEIRA, de propósito.
 *
 * É o caso que o painel do Mundo errava: ele somava só o inventário da conta
 * que estava olhando. Com a água toda na outra conta, um painel que ignora a
 * casa mostra zero — e a família lê "não temos água" tendo água.
 */
await semear('/rest/v1/resource_inventory', {
  profile_id: parceira.id, water_liters: 90, food_days: 6, fuel_liters: 20, battery_percent: 80,
  has_medical_kit: true, has_communication_device: true,
}, 'o inventário da parceira')

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true })
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', chefe.email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})

// ── 1. a fonte canônica ────────────────────────────────────────────────────
const casa = await page.evaluate(async () => (await fetch('/api/household')).json())
casa?.size === 3 && casa.known
  ? ok('/api/household conta as três pessoas', `size=${casa.size} · ${casa.people.map(p => p.name).join(', ')}`)
  : no('a casa não montou', JSON.stringify({ size: casa?.size, known: casa?.known }))

// A despensa da parceira tem que aparecer na soma da casa.
casa?.inventory?.waterLiters === 90
  ? ok('a despensa de quem mora junto entra na soma', `${casa.inventory.waterLiters} L de outra conta`)
  : no('a soma da casa perdeu o inventário do outro', JSON.stringify(casa?.inventory))

// ── 2 e 3. o painel do Mundo diz o mesmo ───────────────────────────────────
await page.goto(`${B}/dashboard`, { waitUntil: 'networkidle' })
await page.waitForTimeout(7000)

const noPainel = await page.evaluate(() => {
  const txt = document.body.innerText
  // A faixa em repouso: "N,N dias · …"
  const dias = txt.match(/(\d+[.,]\d+)\s*dias/)
  return { dias: dias ? Number(dias[1].replace(',', '.')) : null, amostra: txt.slice(0, 160).replace(/\n+/g, ' · ') }
})

const esperado = Math.min(90 / (3 * 3), (6 * 1) / 3) // água 10d vs comida 2d → 2d
Math.abs((noPainel.dias ?? -1) - esperado) < 0.15
  ? ok('o painel usa a casa inteira na autonomia', `${noPainel.dias} dias (esperado ${esperado.toFixed(1)})`)
  : no('o painel discorda da casa', `painel=${noPainel.dias} esperado=${esperado.toFixed(1)} · ${noPainel.amostra}`)

/*
 * O controle que importa: o painel dividindo por 1 em vez de 3 daria 6 dias de
 * comida em vez de 2. Se o número bater com a conta ERRADA, o conserto não
 * pegou nesta tela.
 */
const seFosseSozinho = Math.min(0 / (3 * 1), 0) // sem a casa, o chefe não tem inventário nenhum
noPainel.dias !== null && Math.abs(noPainel.dias - seFosseSozinho) > 0.15
  ? ok('o painel NÃO está mais contando só a própria conta', `seria ${seFosseSozinho.toFixed(1)} dia(s) do jeito antigo`)
  : no('o painel continua ignorando quem mora junto', `${noPainel.dias} dias`)

// ── 4. o prompt do Pilot não carrega dois números ──────────────────────────
const { getHousehold } = await import('../lib/household.ts').catch(() => ({}))
if (getHousehold) {
  const c = await getHousehold(chefe.id)
  c.size === 3
    ? ok('o Pilot recebe a mesma casa que o painel', `size=${c.size}`)
    : no('o Pilot recebe outra casa', `size=${c.size}`)
} else {
  no('não consegui checar o Pilot', 'rode com `npx tsx`')
}

/*
 * A causa raiz, testada onde ela vivia: a rota montava a linha "Pessoas: N" a
 * partir de `context.people`, que vinha da TELA. Mandar um número absurdo e
 * exigir que ele não apareça é o jeito de provar que o servidor parou de
 * confiar no cliente.
 */
const respondeu = await page.evaluate(async () => {
  const r = await fetch('/api/pilot/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Quantas pessoas moram na minha casa? Responda só o número e os nomes.' }],
      context: {
        // `riskState` inválido de propósito: já derrubou a rota com 500 de
        // corpo vazio (D-134). Aqui ele também serve de controle.
        pt: true, riskState: 'nao_existe', score: 12, headline: 'Estável',
        // A MENTIRA do cliente. O servidor tem que ignorar.
        people: 99, hasInfants: true, hasMedicalConditions: false, mobilityImpaired: 7,
        autonomyDays: 2, waterDays: 10, foodDays: 2, powerDays: 2, fuelDays: 2, checklistPct: 0,
        alerts: [],
      },
    }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
})

const texto = String(respondeu.body?.reply ?? '')
if (!texto) {
  no('o Pilot não respondeu', `HTTP ${respondeu.status} · ${JSON.stringify(respondeu.body).slice(0, 120)}`)
} else {
  !texto.includes('99')
    ? ok('o servidor ignora o número que a tela mandou', 'o cliente disse 99 pessoas e não apareceu')
    : no('o palpite do cliente vazou para a resposta', texto.slice(0, 160))

  // ── 5. e afirma quem mora ali ────────────────────────────────────────────
  const citaTres = /\b3\b|três/i.test(texto)
  const citaNome = /Parceira|Avó Ana/i.test(texto)
  citaTres || citaNome
    ? ok('o Pilot afirma quem mora na casa', texto.replace(/\s+/g, ' ').slice(0, 130))
    : no('o Pilot continua sem afirmar', texto.replace(/\s+/g, ' ').slice(0, 200))
}

// ── 6. controle negativo: sem casa, ninguém inventa ────────────────────────
const sozinho = await criar('Sozinho')
const page2 = await ctx.newPage()
await page2.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page2.fill('input[type="email"]', sozinho.email)
await page2.fill('input[type="password"]', PASS)
await page2.locator('button').last().click()
await page2.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})
const casaSo = await page2.evaluate(async () => (await fetch('/api/household')).json())
// Uma casa de uma pessoa É uma casa. O que não pode é virar zero nem virar N.
casaSo?.size === 1
  ? ok('quem mora sozinho é uma casa de um, não de zero', `size=${casaSo.size}`)
  : no('a casa de uma pessoa se perdeu', JSON.stringify({ size: casaSo?.size, known: casaSo?.known }))

await browser.close()
stopServer()
console.log(`\n${pass} passaram, ${fail} falharam`)
await finish(fail)
