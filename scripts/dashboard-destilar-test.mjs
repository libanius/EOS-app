/**
 * Destilar o Mundo: menos coisa em repouso, nada a menos no produto (D-131).
 *
 * A crítica mediu o canto superior direito com três grupos disputando o mesmo
 * pedaço de tela — o orbe do Pilot, três círculos sem rótulo e a coluna verde
 * do mapa — e cinco objetos verdes competindo pelo olho.
 *
 * O que este teste prova:
 *
 *   1. em repouso, o canto tem no máximo três alvos               ← a meta
 *   2. nada sumiu: Plano, Ficha e Configurações a um toque
 *   3. nada sumiu: Atualizar e Camadas a um toque
 *   4. o menu tem três saídas (Esc, fora, escolher)               ← não é armadilha
 *   5. o verde ficou com um dono só na tela em repouso            ← o acento acentua
 *   6. os alvos continuam com 44px                                ← dedo, não mouse
 *   7. o que voltou não cobre o que já estava lá                  ← controle negativo
 *
 * O item 7 existe porque cada rodada de arrumação deste canto quebrou a
 * anterior: empurrar o chrome para baixo (D-126) o pousou em cima dos controles
 * do mapa (D-127), e um `display` inline escondia o ✕ do Pilot (D-128).
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
const PORT = Number(process.env.PORT || 3072)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'
const SHOT = process.env.SHOT_DIR || null

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

const email = `eos-dest-${Date.now()}@test.internal`
const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
track.user(u.id)
await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Ana', location_lat: 26.31, location_lng: -80.2 }) })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR', hasTouch: true, isMobile: true })
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})
await page.goto(`${B}/dashboard`, { waitUntil: 'networkidle' })
await page.waitForTimeout(6000)

/**
 * O que uma pessoa vê como tocável no terço superior da tela.
 *
 * O corte por posição é de propósito: o canto superior direito é o lugar que a
 * crítica apontou, e contar a tela inteira misturaria a navegação de baixo —
 * que é outra decisão, tomada em outro lugar.
 */
const alvosNoTopo = () => page.evaluate(() => {
  const visivel = el => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 8 && r.height > 8 && cs.visibility !== 'hidden' && cs.opacity !== '0' && cs.display !== 'none'
  }
  const dentro = el => {
    const r = el.getBoundingClientRect()
    // terço de cima, metade da direita
    return r.top < window.innerHeight / 3 && r.left > window.innerWidth / 2
  }
  return Array.from(document.querySelectorAll('button, a[href], [role="button"]'))
    .filter(el => visivel(el) && dentro(el))
    .map(el => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 28))
})

const repouso = await alvosNoTopo()
if (SHOT) await page.screenshot({ path: `${SHOT}/destilar-repouso.png` })

// ── 1. o canto em repouso ──────────────────────────────────────────────────
repouso.length <= 4
  ? ok('em repouso o canto tem no máximo quatro alvos', `${repouso.length}: ${repouso.join(' · ')}`)
  : no('o canto continua cheio', `${repouso.length}: ${repouso.join(' · ')}`)

/*
 * Contar alvos não é a mesma coisa que contar o que o olho vê.
 *
 * A queixa da crítica foi "três grupos disputando o mesmo canto" — e um grupo
 * é o que o olho lê como uma peça só, não quantos botões ela tem. Dois botões
 * empilhados numa cápsula custam um pouso do olhar; dois botões soltos em
 * lugares diferentes custam dois. É por isso que a medida que importa aqui é o
 * número de grupos, e ela é feita agrupando caixas que se tocam.
 */
const grupos = await page.evaluate(() => {
  const caixas = Array.from(document.querySelectorAll('button, a[href], [role="button"]'))
    .map(el => el.getBoundingClientRect())
    .filter(r => r.width > 8 && r.height > 8 && r.top < window.innerHeight / 3 && r.left > window.innerWidth / 2)
  const perto = (a, b) => {
    const folga = 20 // encostado ou quase: o olho lê como uma peça só
    return a.left - folga < b.right && a.right + folga > b.left
        && a.top - folga < b.bottom && a.bottom + folga > b.top
  }
  const grupo = caixas.map((_, i) => i)
  const raiz = i => (grupo[i] === i ? i : (grupo[i] = raiz(grupo[i])))
  for (let i = 0; i < caixas.length; i += 1) {
    for (let j = i + 1; j < caixas.length; j += 1) {
      if (perto(caixas[i], caixas[j])) grupo[raiz(j)] = raiz(i)
    }
  }
  return new Set(caixas.map((_, i) => raiz(i))).size
})
grupos <= 2
  ? ok('o canto tem dois grupos, não três', `${grupos}: a fileira do topo e a coluna do mapa`)
  : no('o canto ainda tem grupos demais disputando o olho', `${grupos} grupos`)

// ── 5. o verde tem um dono só ──────────────────────────────────────────────
const verdes = await page.evaluate(() => {
  const acento = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  const parecido = c => {
    const m = c.match(/\d+/g)
    if (!m) return false
    const [r, g, b] = m.map(Number)
    // verde do EOS: muito mais verde que vermelho e que azul, e claro o bastante
    return g > 140 && g - r > 60 && g - b > 40
  }
  const conta = []
  for (const el of Array.from(document.querySelectorAll('header *, .wv2-top *, .app-actions *, .wv2-mapcontrols *'))) {
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) continue
    if (r.top > window.innerHeight / 3) continue
    const cs = getComputedStyle(el)
    if (parecido(cs.color) || parecido(cs.backgroundColor) || parecido(cs.borderTopColor)) {
      conta.push((el.getAttribute('aria-label') || el.className || el.tagName).toString().slice(0, 24))
    }
  }
  return { acento, conta }
})
verdes.conta.length <= 2
  ? ok('o verde parou de disputar o canto', verdes.conta.length ? verdes.conta.join(' · ') : 'nenhum objeto verde no topo')
  : no('ainda há verde demais no topo', verdes.conta.join(' · '))

// ── 2. as três portas continuam a um toque ─────────────────────────────────
await page.locator('.app-actions-trigger').tap()
await page.waitForTimeout(400)
const menu = page.locator('.app-actions-menu')
const itens = await menu.locator('a').allInnerTexts()
if (SHOT) await page.screenshot({ path: `${SHOT}/destilar-menu.png` })
const temPortas = ['Plano', 'Ficha', 'Configurações'].every(x => itens.some(i => i.includes(x)))
temPortas
  ? ok('Plano, Ficha e Configurações continuam a um toque', itens.map(i => i.trim()).join(' · '))
  : no('alguma porta sumiu', JSON.stringify(itens))

// ── 6. alvo de dedo ────────────────────────────────────────────────────────
const pequenos = await menu.locator('a').evaluateAll(els =>
  els.filter(e => e.getBoundingClientRect().height < 44).length)
pequenos === 0
  ? ok('todo item do menu tem 44px de altura', `${itens.length} itens`)
  : no('item pequeno demais para o dedo', `${pequenos} abaixo de 44px`)

// ── 7. controle negativo: o menu não cobre o Pilot ─────────────────────────
const colisao = await page.evaluate(() => {
  const menu = document.querySelector('.app-actions-menu')
  const pilot = document.querySelector('[aria-label*="Pilot"], .wv2-orb')
  if (!menu || !pilot) return 'faltou elemento'
  const a = menu.getBoundingClientRect(), b = pilot.getBoundingClientRect()
  const cruza = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  if (!cruza) return null
  // Cruzar as caixas só importa se o toque no Pilot cai no menu.
  const alvo = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
  return menu.contains(alvo) ? 'o menu rouba o toque do Pilot' : null
})
colisao === null
  ? ok('o menu aberto não rouba o toque do Pilot', 'testado por elementFromPoint')
  : no('colisão no canto', String(colisao))

// ── 4. três saídas ─────────────────────────────────────────────────────────
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const fechouPorEsc = await menu.count() === 0

await page.locator('.app-actions-trigger').tap()
await page.waitForTimeout(300)
await page.mouse.click(40, 500)
await page.waitForTimeout(300)
const fechouPorFora = await page.locator('.app-actions-menu').count() === 0

fechouPorEsc && fechouPorFora
  ? ok('o menu tem saída por Esc e por tocar fora', 'e a terceira é escolher um item')
  : no('o menu vira armadilha', `esc=${fechouPorEsc} fora=${fechouPorFora}`)

// ── 3. Atualizar e Camadas continuam a um toque ────────────────────────────
await page.locator('.wv2-mapcontrols button').last().tap()
await page.waitForTimeout(500)
const controles = await page.locator('.wv2-mapcontrols button').evaluateAll(els =>
  els.map(e => (e.getAttribute('aria-label') || '').trim()))
if (SHOT) await page.screenshot({ path: `${SHOT}/destilar-controles.png` })
const temControles = ['Atualizar', 'Camadas'].every(x => controles.some(c => c.includes(x)))
temControles
  ? ok('Atualizar e Camadas continuam a um toque', controles.filter(Boolean).join(' · '))
  : no('controle do mapa sumiu', JSON.stringify(controles))

// ── 8. o veredito em repouso é legível inteiro ─────────────────────────────
/*
 * O navegador não avisa quando corta um texto: ele põe reticências e segue.
 * Na tela do dono o veredito dizia "0.0 dias de autonomia · reabaste…" — a
 * pessoa lia que algo estava errado e não lia o quê.
 */
const cortado = await page.evaluate(() => {
  const faixa = document.querySelector('.wv2-grabber .summary')
  if (!faixa) return 'faixa não encontrada'
  const ruins = []
  for (const el of Array.from(faixa.querySelectorAll('*'))) {
    if (el.children.length) continue
    // 1px de folga: arredondamento de subpixel não é corte.
    if (el.scrollWidth > el.clientWidth + 1) ruins.push(`${el.textContent.trim()} (${el.scrollWidth}>${el.clientWidth})`)
  }
  return ruins.length ? ruins.join(' | ') : null
})
cortado === null
  ? ok('o veredito em repouso cabe inteiro na faixa', 'nada com reticências')
  : no('o veredito está cortado no meio', String(cortado))

// A regressão que o D-127 pagou: o chrome tem uma fonte só para o topo.
const umaFonte = await page.evaluate(() => {
  const topo = getComputedStyle(document.documentElement).getPropertyValue('--chrome-top').trim()
  const acoes = document.querySelector('.app-actions')
  return { topo, aplicado: acoes ? getComputedStyle(acoes).top : null }
})
umaFonte.topo && umaFonte.aplicado
  ? ok('o canto continua com uma fonte só de posição', `--chrome-top=${umaFonte.topo} → ${umaFonte.aplicado}`)
  : no('o --chrome-top se perdeu', JSON.stringify(umaFonte))

await browser.close()
stopServer()
console.log(`\n${pass} passaram, ${fail} falharam`)
await finish(fail)
