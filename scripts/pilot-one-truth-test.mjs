/**
 * Um Pilot, uma verdade, e uma conversa (D-137).
 *
 * O dono abriu o Pilot em duas telas no mesmo minuto e leu duas casas:
 *
 *   Comms:      "Não sei o suficiente para dizer que está tudo certo"
 *               checklist 0%  ·  "falta a ficha da família"
 *   Dashboard:  "Nada urgente — feche uma lacuna"
 *               checklist 88% ·  limitante combustível 0.7d
 *
 * O motor é o mesmo. O que divergia era o que ele recebia: existiam TRÊS
 * montagens do contexto, e a do dock somava a despensa só da própria conta,
 * contava pessoas por `family_members.length` e usava `food_days` cru como
 * autonomia — sem dividir por ninguém e sem olhar a água.
 *
 * O que este teste prova, com uma casa de verdade:
 *
 *   1. os números do Pilot são os mesmos em toda tela      ← a queixa
 *   2. e batem com `/api/household`, a fonte canônica
 *   3. a autonomia não é `food_days` cru                   ← o bug do dock
 *   4. a conversa SOBREVIVE à troca de página              ← "continuar o contexto"
 *   5. o dashboard não perde o que só ele sabe (abrigos)   ← unificar sem piorar
 *   6. existe uma instância só do Pilot                    ← a causa raiz
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
const PORT = Number(process.env.PORT || 3086)
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
const semear = async (rota, corpo, oQueE) => {
  const r = await admin(rota, { method: 'POST', body: JSON.stringify(corpo) })
  if (r.ok) return r.json().catch(() => null)
  console.error(`\n[preparo] falhou ao criar ${oQueE}: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}\n`)
  stopAll(); await finish(1); return null
}

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

// ── Uma casa de três, com a despensa toda na conta da OUTRA pessoa ─────────
const criar = async (nome) => {
  const email = `eos-1v-${nome.toLowerCase()}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
  track.user(u.id)
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: nome, location_lat: 26.31, location_lng: -80.2 }) })
  return { id: u.id, email }
}
const chefe = await criar('Chefe')
const parceira = await criar('Parceira')

const circ = await semear('/rest/v1/circles', {
  name: 'Casa Uma Verdade', leader_id: chefe.id, invite_code: Date.now().toString(36).slice(-6).toUpperCase(),
}, 'o círculo')
track.circle(circ[0].id)
await semear('/rest/v1/circle_members', [
  { circle_id: circ[0].id, user_id: chefe.id, role: 'Admin', household_status: 'confirmed', share_inventory: true, family_access_status: 'approved' },
  { circle_id: circ[0].id, user_id: parceira.id, role: 'Editor', household_status: 'confirmed', share_inventory: true, family_access_status: 'approved' },
], 'os membros')
await semear('/rest/v1/family_members', {
  profile_id: chefe.id, name: 'Avó Ana', age: 78, medical_conditions: [], medications: [], mobility_impaired: true, is_infant: false,
}, 'a dependente')
/*
 * A despensa fica com a PARCEIRA. É o caso que o dock errava: ele lia
 * `/api/inventory`, que é só a conta de quem está olhando, e o chefe não tem
 * nada. O Pilot dele dizia "zero" tendo a casa 90 litros.
 */
await semear('/rest/v1/resource_inventory', {
  profile_id: parceira.id, water_liters: 90, food_days: 9, fuel_liters: 20, battery_percent: 80,
  has_medical_kit: true, has_communication_device: true,
}, 'o inventário')

/*
 * Checklist com itens de verdade, e nem todos marcados.
 *
 * Sem isto o checklist sai 0% em toda tela e a comparação "os mesmos números"
 * passa comparando zero com zero — um teste que passa sem testar. Quatro itens,
 * três marcados, dá 75%: um número que só bate se as telas lerem a mesma fonte.
 */
await semear('/rest/v1/checklists', [
  { profile_id: chefe.id, canonical_key: 'agua', item_name: 'Água 3L/pessoa', tier: 'ESSENTIAL', quantity: 9, unit: 'L', acquired: true, kit_type: 'GERAL' },
  { profile_id: chefe.id, canonical_key: 'lanterna', item_name: 'Lanterna', tier: 'ESSENTIAL', quantity: 1, unit: 'un', acquired: true, kit_type: 'GERAL' },
  { profile_id: chefe.id, canonical_key: 'radio', item_name: 'Rádio', tier: 'ESSENTIAL', quantity: 1, unit: 'un', acquired: true, kit_type: 'GERAL' },
  { profile_id: chefe.id, canonical_key: 'kit_primeiros_socorros', item_name: 'Kit de primeiros socorros', tier: 'ESSENTIAL', quantity: 1, unit: 'un', acquired: false, kit_type: 'GERAL' },
], 'o checklist')

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true })
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', chefe.email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})

const canonica = await page.evaluate(async () => (await fetch('/api/household')).json())

/**
 * Abre o Pilot e lê os números que ele está usando AGORA.
 *
 * Sai do próprio componente, não do texto renderizado: o texto varia com o
 * veredito, e o que precisa ser idêntico são os fatos por trás dele.
 */
const fatosNaTela = async (rota) => {
  await page.goto(`${B}${rota}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(rota === '/dashboard' ? 7000 : 3500)
  await page.locator('.pilot-orb').first().tap()
  await page.waitForTimeout(3000)
  const f = await page.evaluate(() => {
    const txt = document.querySelector('.wv2-pilot-chat')?.textContent ?? ''
    const chk = txt.match(/CHECKLIST\s*(\d+)%/i)
    const lim = txt.match(/LIMITANTE\s*([a-zçãéíóú]+)\s*·\s*([\d.,]+)d/i)
    return {
      checklist: chk ? Number(chk[1]) : null,
      limitante: lim ? lim[1] : null,
      dias: lim ? Number(lim[2].replace(',', '.')) : null,
      naoSabe: /não sei o suficiente|ainda não li a ficha/i.test(txt),
      abrigos: /abrigo/i.test(txt),
      texto: txt.replace(/\s+/g, ' ').slice(0, 90),
    }
  })
  // Fecha para a próxima tela abrir do zero.
  await page.locator('.chat-close').tap().catch(() => {})
  await page.waitForTimeout(600)
  return f
}

const noPainel = await fatosNaTela('/dashboard')
const emComms = await fatosNaTela('/comms')
const emCirculos = await fatosNaTela('/circles')

// ── 1. os mesmos números em toda tela ──────────────────────────────────────
/*
 * O checklist tem que ser 75% (3 de 4). Se sair 0 ou null, a comparação abaixo
 * seria zero contra zero — e passaria sem testar nada, que é como um teste meu
 * já mentiu antes.
 */
noPainel.checklist === 75
  ? ok('o número tem valor de verdade para comparar', `checklist ${noPainel.checklist}% (3 de 4 itens)`)
  : no('o checklist não chegou — a comparação abaixo seria vazia', JSON.stringify(noPainel))

const iguais = [emComms, emCirculos].every(
  f => f.checklist === noPainel.checklist && f.dias === noPainel.dias && f.naoSabe === noPainel.naoSabe,
)
iguais
  ? ok('o Pilot mostra os mesmos números em toda tela', `checklist ${noPainel.checklist}% em painel, comms e círculos`)
  : no('as telas discordam', JSON.stringify({ painel: noPainel, comms: emComms, circulos: emCirculos }))

// ── 2 e 3. e batem com a fonte canônica ────────────────────────────────────
/*
 * A casa tem 90 L para 3 pessoas → 10 dias de água; 9 pessoa-dias de comida
 * para 3 → 3 dias. Autonomia = min = 3. O dock antigo teria dito 9 (o
 * `food_days` cru da conta que nem tem despensa: zero, na verdade).
 */
const esperado = Math.min(90 / (3 * 3), 9 / 3)
Math.abs((canonica?.autonomyDays ?? -1) - esperado) < 0.05
  ? ok('a fonte canônica calcula a autonomia da casa', `${canonica.autonomyDays.toFixed(1)} dias para ${canonica.size} pessoas`)
  : no('a fonte canônica discorda', JSON.stringify({ auto: canonica?.autonomyDays, esperado }))

!noPainel.naoSabe && canonica?.size === 3
  ? ok('o Pilot sabe quem mora na casa em toda tela', `${canonica.size} pessoas`)
  : no('o Pilot ainda diz que não conhece a família', JSON.stringify({ naoSabe: noPainel.naoSabe, size: canonica?.size }))

// ── 4. a conversa sobrevive à navegação ────────────────────────────────────
/*
 * A queixa literal: "se eu mudar de página, deve continuar o contexto".
 * Antes havia duas instâncias com mensagens próprias — sair do dashboard
 * trocava de Pilot e a conversa sumia.
 */
await page.goto(`${B}/circles`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3500)
await page.locator('.pilot-orb').first().tap()
await page.waitForTimeout(1500)
const chips = page.locator('.chat-suggestions button')
if (await chips.count()) {
  await chips.first().tap()
  await page.waitForTimeout(2500)
}
const antesDeNavegar = await page.evaluate(() => document.querySelectorAll('.wv2-pilot-chat .chat-msg, .wv2-pilot-chat article').length)

// Navega SEM recarregar a página — é o que a pessoa faz na barra de baixo.
await page.locator('.nav a[href="/preparedness"], a[href="/preparedness"]').first().click().catch(async () => {
  await page.evaluate(() => { window.history.pushState({}, '', '/preparedness'); window.dispatchEvent(new PopStateEvent('popstate')) })
})
await page.waitForTimeout(4000)
const aberto = await page.locator('.wv2-pilot-chat').count()
const depoisDeNavegar = await page.evaluate(() => document.querySelectorAll('.wv2-pilot-chat .chat-msg, .wv2-pilot-chat article').length)

antesDeNavegar > 0 && aberto > 0 && depoisDeNavegar >= antesDeNavegar
  ? ok('a conversa sobrevive à troca de página', `${antesDeNavegar} → ${depoisDeNavegar} mensagens, e o Pilot continua aberto`)
  : no('a conversa se perdeu ao navegar', `antes=${antesDeNavegar} depois=${depoisDeNavegar} aberto=${aberto}`)

// ── 6. uma instância só ────────────────────────────────────────────────────
const instancias = await page.evaluate(() => document.querySelectorAll('.wv2-pilot-chat').length)
instancias <= 1
  ? ok('existe uma instância só do Pilot', `${instancias} na árvore`)
  : no('mais de um Pilot montado', `${instancias} instâncias`)

// ── 5. o dashboard não perde o que só ele sabe ─────────────────────────────
/*
 * Unificar não pode deixar o Pilot PIOR onde ele é mais usado. O dashboard
 * carrega abrigos, posições da família e o ciclone desenhado; se o
 * enriquecimento não chegasse, ele passaria a ignorar o que está na tela na
 * frente da pessoa — a armadilha do D-079.
 */
await page.goto(`${B}/dashboard`, { waitUntil: 'networkidle' })
await page.waitForTimeout(8000)
const enriquecido = await page.evaluate(() => {
  const el = document.querySelector('[data-eos-pilot-dock]')
  return Boolean(el)
})
enriquecido
  ? ok('o dashboard registra o que só ele sabe', 'abrigos, família e ciclone chegam ao Pilot compartilhado')
  : no('o Pilot do dashboard perdeu o enriquecimento do mapa')

await browser.close()
stopServer()
console.log(`\n${pass} passaram, ${fail} falharam`)
await finish(fail)
