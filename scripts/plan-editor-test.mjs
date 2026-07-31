/**
 * Editor do plano de voo, com dois navegadores de verdade (PLAN-T02/T04/T05).
 *
 * Prova as coisas que só falham quando duas pessoas usam ao mesmo tempo:
 *
 *   1. o plano não deixa salvar sem ponto de encontro e sem papel (doc 18 §3)
 *   2. sem endereço de casa, a tela DIZ por que não mostra distância — antes ela
 *      simplesmente omitia o número, e ausência parece "está tudo bem"
 *   3. o autor define casa e ponto pelo GPS, atribui um papel e salva a v1
 *   4. o outro membro ABRE e vê o plano — e vê o aviso de que precisa reconhecer
 *   5. reconhecer registra, e o autor passa a ver quem já viu (doc 18 §6.4)
 *   6. uma nova versão INVALIDA o reconhecimento antigo — quem já tinha visto
 *      volta para "ainda não viram", que é o ponto inteiro do versionamento
 *   7. um gatilho sugerido vira linha no banco, com condição e ação
 *   8. a família desenha uma rota no mapa e ela vira LineString no banco (§5)
 *   9. o SIMULADOR cobra o plano: com as vias bloqueadas, um ponto de encontro
 *      longe demais para ir a pé vira lacuna no debrief (SIM-T06)
 *  10. o ponto pode ser escolhido NO MAPA, com a mira no centro e imagem de
 *      satélite — o caso do condomínio, onde vários prédios dividem o mesmo
 *      número e a busca por endereço devolve um ponto só
 *  11. GPS negado não trava a tela: o motivo é dito e o mapa continua como saída
 *  12. sem rede, o plano continua na tela, rotulado como cópia local, E a carta
 *      do plano é DESENHADA — pinos, traçado, norte e escala, sem tile nenhum
 *      (doc 18 §13: seguir as rotas com o avião no chão)
 *
 * O item 6 é o que separa um plano de um desenho: se um ack antigo fosse
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
const HOME = { latitude: 26.3106, longitude: -80.2456 }   // Parkland, FL
const SQUARE = { latitude: 26.3168, longitude: -80.2381 } // ~1 km a nordeste
const FAR = { latitude: 26.5265, longitude: -80.2456 }    // ~24 km: horas a pé

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

/**
 * Define um ponto pelo GPS, no fluxo real do picker.
 *
 * `scope` existe porque a casa e os pontos de encontro compartilham o rótulo
 * "Trocar". Sem escopo, o teste clicava no cartão da casa acreditando estar
 * mexendo no ponto de encontro — passava, e testava outra coisa.
 */
async function setPoint(page, buttonText, name, scope = null) {
  const root = scope ? page.locator(scope) : page
  await root.locator(`button:has-text("${buttonText}")`).first().click()
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
const { page: a, ctx: actx } = await login(browser, author)

// ── 1. sem ponto e sem papel, não salva ──────────────────────────────────────
await a.goto(`${B}/plan`, { waitUntil: 'networkidle' })
// A PRIMEIRA carga registra o service worker, que faz precache de ~110 arquivos
// e disputa a rede com as chamadas de API. Esperar o editor aparecer, em vez de
// um tempo fixo, é a diferença entre um teste estável e um teste que às vezes
// acusa um bug que não existe.
const saveBtn = a.locator('button:has-text("Salvar plano")')
await saveBtn.waitFor({ timeout: 60000 })
const gapsShown = await a.locator('text=Falta para o plano ficar executável').count()
const disabled = await saveBtn.isDisabled().catch(() => null)
gapsShown && disabled
  ? ok('plano vazio não salva e diz o que falta')
  : no('plano vazio deixou salvar', `lacunas=${gapsShown} desabilitado=${disabled}`)

// ── 2. a ausência de casa é DITA, não omitida ────────────────────────────────
// A mensagem só faz sentido quando já existe um ponto de encontro: é aí que a
// distância deveria aparecer e não aparece. Num plano vazio não há o que
// explicar, então a checagem vem depois do primeiro ponto — que também é o
// caminho real de quem começa marcando onde a família se encontra.
await setPoint(a, 'Marcar este ponto', 'Portão da frente')
await a.waitForTimeout(400)
const explained = await a.locator('text=Defina o endereço de casa para ver distância').count()
explained
  ? ok('sem casa definida, a tela explica a distância ausente')
  : no('a distância some sem explicação — falha silenciosa de volta')

// ── 3. autor define a casa, atribui um papel e salva a v1 ────────────────────
await setPoint(a, 'Definir endereço de casa', 'Nossa casa')
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

// ── 4. o outro membro abre e é chamado a reconhecer ──────────────────────────
const { page: b, ctx: bctx } = await login(browser, member)
await b.goto(`${B}/plan`, { waitUntil: 'networkidle' })
await b.waitForTimeout(2000)
const seesPoint = await b.locator('text=Portão da frente').count()
const seesAck = await b.locator('text=O plano mudou').count()
seesPoint && seesAck
  ? ok('membro vê o plano e o aviso de reconhecimento')
  : no('membro não viu o plano/aviso', `ponto=${seesPoint} aviso=${seesAck}`)

// ── 5. reconhecer registra, e o autor enxerga quem viu ───────────────────────
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

// ── 6. nova versão invalida o reconhecimento antigo ──────────────────────────
await setPoint(a, 'Trocar', 'Praça do quarteirão', '.wv2-plan-step:not(.wv2-plan-home)')
await a.waitForTimeout(500)
await a.locator('button:has-text("Salvar plano")').click()
await a.waitForTimeout(4000)

const v2 = await admin(`/rest/v1/family_plans?circle_id=eq.${circle[0].id}&select=version`).then(r => r.json())
const stillOn = await a.locator(`.wv2-plan-acks .wv2-chip.on:has-text("${member.name}")`).count()
v2?.[0]?.version === 2 && stillOn === 0
  ? ok('v2 invalidou o reconhecimento da v1', `${member.name} voltou para "ainda não viram"`)
  : no('ack antigo foi carregado adiante', `versão=${v2?.[0]?.version} aindaMarcado=${stillOn}`)

// ── 7. gatilhos: da sugestão à linha no banco ────────────────────────────────
// Este caminho degrada sozinho quando a migration não foi aplicada, então o
// teste precisa saber diferenciar "degradou" de "funcionou".
const suggestion = a.locator('button:has-text("+ Sem contato com alguém da família")')
if (await suggestion.count()) {
  await suggestion.click()
  await a.locator('.wv2-plan-trigger input').nth(1).fill('Ir para a praça do quarteirão')
  await a.waitForTimeout(300)
  await a.locator('button:has-text("Salvar plano")').click()
  await a.waitForTimeout(4000)
  const rows = await admin(`/rest/v1/family_plan_triggers?plan_id=eq.${v1?.[0]?.id}&select=condition,action`).then(r => r.json())
  rows?.[0]?.condition?.includes('Sem contato') && rows[0].action.includes('praça')
    ? ok('gatilho gravado com condição e ação', JSON.stringify(rows[0]))
    : no('gatilho não gravou', JSON.stringify(rows).slice(0, 200))
} else {
  const pending = await a.locator('text=espera uma migração no banco').count()
  pending
    ? no('gatilhos indisponíveis: migration 20260730000000 não aplicada')
    : no('seção de gatilhos não apareceu nem como pendente')
}

// ── 8. rota desenhada pela família (§5) ─────────────────────────────────────
// Precisa de DOIS lugares distintos, então a posição do navegador muda entre um
// ponto e outro — com um só ponto a rota teria comprimento zero e não provaria
// nada sobre a geometria.
await actx.setGeolocation(SQUARE)
await setPoint(a, '+ Escola', 'Escola da Isadora')
await a.waitForTimeout(400)

await a.locator('button:has-text("+ Desenhar rota")').click()
const draw = a.locator('[role="dialog"][aria-label="Desenhar rota"]')
await draw.waitFor({ timeout: 15000 })
await a.locator('.wv2-draw-map canvas').waitFor({ timeout: 20000 })
await a.waitForTimeout(2500)                       // o estilo do mapa precisa carregar
for (const [x, y] of [[140, 160], [200, 220], [260, 180]]) {
  await a.locator('.wv2-draw-map').click({ position: { x, y } })
  await a.waitForTimeout(250)
}
await draw.locator('label:has-text("Nome da rota") input').fill('De casa até a praça')
await draw.locator('label:has-text("O que a família precisa saber") input').fill('não pegue a ponte baixa, ela alaga')
await draw.locator('button:has-text("Salvar rota")').click()
await draw.waitFor({ state: 'detached', timeout: 10000 })
await a.locator('button:has-text("Salvar plano")').click()
await a.waitForTimeout(4000)

const drawn = await admin(`/rest/v1/family_plan_routes?plan_id=eq.${v1?.[0]?.id}&select=label,mode,notes,geometry`).then(r => r.json())
const coords = drawn?.[0]?.geometry?.coordinates ?? []
drawn?.[0]?.label === 'De casa até a praça' && coords.length >= 4 && drawn[0].notes?.includes('ponte baixa')
  ? ok('rota desenhada virou LineString no banco', `${coords.length} pontos · ${drawn[0].mode}`)
  : no('rota não gravou', JSON.stringify(drawn).slice(0, 220))

// ── 9. o simulador cobra o plano (SIM-T06) ──────────────────────────────────
// A prova de fiação: o debrief precisa BUSCAR o plano do círculo e medir a
// distância real. Sem esta checagem, um erro de mapeamento de campo produziria
// silêncio — e silêncio parece "está tudo certo".
await actx.setGeolocation(FAR)
await setPoint(a, 'Marcar este ponto', 'Sítio do vô')   // rendezvous_2, ~24 km de casa
await a.waitForTimeout(400)
await a.locator('button:has-text("Salvar plano")').click()
await a.waitForTimeout(4000)

await a.goto(`${B}/scenario`, { waitUntil: 'networkidle' })
await a.locator('button:has-text("Iniciar simulação")').waitFor({ timeout: 30000 })
await a.locator('text=Vias bloqueadas').click()
await a.waitForTimeout(300)
await a.locator('button:has-text("Iniciar simulação")').click()
await a.waitForTimeout(2500)
await a.locator('button:has-text("Encerrar")').first().click()
await a.waitForTimeout(6000)

const debrief = await a.evaluate(() => document.body.innerText)
debrief.includes('longe demais a pé') && debrief.includes('Sítio do vô')
  ? ok('debrief cobrou o plano: ponto inalcançável a pé no cenário')
  : no('debrief não cobrou o plano', debrief.slice(0, 200).replace(/\n+/g, ' | '))

// ── 10. escolher o ponto no mapa, com a mira ────────────────────────────────
// O passo anterior rodou a simulação e deixou o navegador no cenário.
await a.goto(`${B}/plan`, { waitUntil: 'networkidle' })
await a.locator('button:has-text("+ Trabalho")').waitFor({ timeout: 60000 })
await a.locator('button:has-text("+ Trabalho")').click()
const dialog = a.locator('[role="dialog"][aria-label="Onde fica?"]')
await dialog.waitFor({ timeout: 10000 })
await dialog.locator('button:has-text("Escolher no mapa")').click()

const mapPick = a.locator('[role="dialog"][aria-label="Escolher no mapa"]')
await mapPick.waitFor({ timeout: 15000 })
await a.locator('.wv2-mappick-map canvas').waitFor({ timeout: 20000 })
await a.waitForTimeout(2500)

// A mira é fixa: arrastar o mapa muda o ponto escolhido. Se as coordenadas não
// mudarem com o arrasto, a mira não está lendo o centro da câmera.
const before = await mapPick.locator('.coords').innerText()
const box = await a.locator('.wv2-mappick-map').boundingBox()
await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await a.mouse.down()
await a.mouse.move(box.x + box.width / 2 - 90, box.y + box.height / 2 - 60, { steps: 12 })
await a.mouse.up()
await a.waitForTimeout(1200)
const after = await mapPick.locator('.coords').innerText()

await mapPick.locator('button:has-text("Usar este ponto")').click()
await mapPick.waitFor({ state: 'detached', timeout: 10000 })
const marked = await dialog.locator('text=Ponto marcado').count()
await dialog.locator('label:has-text("Como a família chama") input').fill('Escritório')
await dialog.locator('button:has-text("Confirmar")').click()
await dialog.waitFor({ state: 'detached', timeout: 10000 })
await a.locator('button:has-text("Salvar plano")').click()
await a.waitForTimeout(4000)

const work = await admin(`/rest/v1/family_plan_waypoints?plan_id=eq.${v1?.[0]?.id}&kind=eq.work&select=name,lat,lng`).then(r => r.json())
before !== after && marked && work?.[0]?.name === 'Escritório'
  ? ok('ponto escolhido no mapa pela mira', `${before} → ${after}`)
  : no('escolha no mapa falhou', `mudou=${before !== after} confirmou=${marked} gravou=${JSON.stringify(work)}`)

// ── 11. GPS negado: motivo dito, e o mapa continua disponível ───────────────
// O dono viu o botão de posição expirar de verdade. Um erro de GPS não pode
// deixar a pessoa sem caminho — a saída é escolher o pino, que não depende de
// GPS nenhum.
await actx.clearPermissions()
await a.goto(`${B}/plan`, { waitUntil: 'networkidle' })
await a.locator('button:has-text("+ Outro")').waitFor({ timeout: 60000 })
await a.locator('button:has-text("+ Outro")').click()
const denied = a.locator('[role="dialog"][aria-label="Onde fica?"]')
await denied.waitFor({ timeout: 10000 })
await denied.locator('button:has-text("Usar minha posição")').click()
await a.waitForTimeout(4000)
const motivo = await denied.locator('p.warn').first().innerText().catch(() => '')
const saida = await denied.locator('button:has-text("Escolher no mapa")').count()
const travado = await denied.locator('button:has-text("Procurando você…")').count()
motivo.length > 20 && saida === 1 && travado === 0
  ? ok('GPS negado: motivo na tela e mapa como saída', motivo.slice(0, 60) + '…')
  : no('falha de GPS deixou a tela sem resposta', `motivo="${motivo}" saída=${saida} travado=${travado}`)
await denied.locator('button:has-text("Cancelar")').click()

// ── 12. sem rede, o plano continua legível (doc 18 §13) ───────────────────────
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

// A carta precisa existir com a rede caída: é o único "mapa" que sobrevive ao
// avião no chão, porque é desenhado das coordenadas que já estão no aparelho.
const chart = await b.evaluate(() => {
  const svg = document.querySelector('.wv2-chart svg')
  if (!svg) return null
  return {
    pinos: svg.querySelectorAll('.chart-pin').length,
    tracados: svg.querySelectorAll('.chart-route').length,
    norte: svg.querySelectorAll('.chart-north').length,
    escala: svg.querySelectorAll('.chart-scale text').length,
    rotulo: svg.getAttribute('aria-label') ?? '',
  }
})
chart && chart.pinos >= 3 && chart.tracados >= 1 && chart.norte === 1 && chart.escala === 1
  ? ok('carta do plano desenhada offline', `${chart.pinos} pinos, ${chart.tracados} traçado(s) · "${chart.rotulo.slice(0, 60)}…"`)
  : no('carta não desenhou offline', JSON.stringify(chart))
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
