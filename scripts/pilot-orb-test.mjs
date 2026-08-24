/**
 * Um orbe só, em toda tela (D-136).
 *
 * Existiam dois. No dashboard, `.bar-orb`: 46px, pílula de vidro esfumaçado,
 * ícone de 22px, sempre verde. Em todas as outras telas, `.wv2-dock-orb`: 56px,
 * círculo com borda e fundo próprios, ícone de 24px, brilho de 8px, e a cor
 * mudando com o risco — verde, amarelo, laranja, vermelho.
 *
 * O comentário do dock ainda afirmava "O MESMO orbe da PilotBar". Não era.
 *
 * Custa mais que feiura: num app que a família abre sob estresse, reconhecer é
 * metade do trabalho. Aprender o Pilot numa tela e ter que aprender de novo na
 * seguinte é uma cobrança feita no pior momento possível.
 *
 * O que este teste prova:
 *
 *   1. existe um orbe em toda tela                            ← nenhuma órfã
 *   2. tamanho, forma, cor, borda e ícone são IDÊNTICOS
 *   3. o orbe NÃO muda de cor com o risco                     ← a regressão antiga
 *   4. existe UM só por tela                                  ← nunca dois caminhos
 *   5. ele abre o mesmo Pilot em qualquer tela
 *   6. tocar fora da janela fecha o Pilot
 *   7. e continua arrastável fora do dashboard
 *
 * O item 3 é o que mais importa preservar. O risco tem lugares próprios para
 * ser dito — a faixa, o índice, os alertas. Um botão que muda de cor é um botão
 * que se deixa de reconhecer justamente no dia em que mais se precisa achá-lo.
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
const PORT = Number(process.env.PORT || 3084)
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

const email = `eos-orb-${Date.now()}@test.internal`
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

/** Tudo o que faz o olho reconhecer o botão. A POSIÇÃO fica de fora de propósito. */
const medir = async (rota, nome) => {
  await page.goto(`${B}${rota}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(rota === '/dashboard' ? 7000 : 3500)
  const m = await page.evaluate(() => {
    const todos = document.querySelectorAll('.pilot-orb')
    const el = todos[0]
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const svg = el.querySelector('svg')
    return {
      quantos: todos.length,
      w: Math.round(r.width), h: Math.round(r.height),
      raio: cs.borderRadius, cor: cs.color, borda: cs.borderTopColor,
      fundo: cs.backgroundColor, sombra: cs.boxShadow.slice(0, 60),
      icone: svg ? svg.getAttribute('width') : null,
      filtroDoIcone: svg ? getComputedStyle(svg).filter : null,
    }
  })
  if (SHOT && m) await page.locator('.pilot-orb').first().screenshot({ path: `${SHOT}/orb-${nome}.png` })
  return m
}

const TELAS = [
  ['/dashboard', 'dashboard'],
  ['/ficha', 'ficha'],
  ['/circles', 'circulos'],
  ['/preparedness', 'preparacao'],
  ['/plan', 'plano'],
  ['/comms', 'comms'],
]

const medidas = []
for (const [rota, nome] of TELAS) medidas.push([nome, await medir(rota, nome)])

// ── 1. nenhuma tela órfã ───────────────────────────────────────────────────
const semOrbe = medidas.filter(([, m]) => !m).map(([n]) => n)
semOrbe.length === 0
  ? ok('toda tela tem o orbe', TELAS.map(t => t[1]).join(', '))
  : no('tela sem Pilot', semOrbe.join(', '))

const validas = medidas.filter(([, m]) => m)
const [, base] = validas[0] ?? [null, null]

// ── 4. um só por tela ──────────────────────────────────────────────────────
const duplicadas = validas.filter(([, m]) => m.quantos !== 1).map(([n, m]) => `${n}=${m.quantos}`)
duplicadas.length === 0
  ? ok('exatamente um orbe por tela', 'nunca dois caminhos para a mesma coisa')
  : no('mais de um orbe na mesma tela', duplicadas.join(' · '))

// ── 2. idênticos no que o olho lê ──────────────────────────────────────────
const CHAVES = ['w', 'h', 'raio', 'cor', 'borda', 'fundo', 'sombra', 'icone', 'filtroDoIcone']
const diferentes = validas
  .map(([nome, m]) => [nome, CHAVES.filter(k => m[k] !== base[k])])
  .filter(([, ks]) => ks.length)
if (diferentes.length === 0) {
  ok('o mesmo orbe em todas as telas', `${base.w}×${base.h} · raio ${base.raio} · ${base.cor} · ícone ${base.icone}px`)
} else {
  for (const [nome, ks] of diferentes) {
    no(`${nome} desenha um orbe diferente`, ks.map(k => `${k}: ${base[k]} → ${validas.find(v => v[0] === nome)[1][k]}`).join(' · '))
  }
}

// ── 3. a cor NÃO segue o risco ─────────────────────────────────────────────
/*
 * A versão antiga do dock pintava o orbe de amarelo, laranja ou vermelho
 * conforme o risco. Este cheque é o que impede aquilo de voltar: a cor é a
 * mesma em toda tela, e é o verde do acento.
 */
const cores = new Set(validas.map(([, m]) => m.cor))
cores.size === 1 && base.cor.replace(/\s/g, '') === 'rgb(48,209,88)'
  ? ok('o orbe não muda de cor com o risco', `sempre ${base.cor}`)
  : no('a cor do orbe varia', Array.from(cores).join(' · '))

// ── 5. abre o mesmo Pilot ──────────────────────────────────────────────────
await page.goto(`${B}/circles`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3500)
await page.locator('.pilot-orb').first().tap()
await page.waitForTimeout(2000)
const abriuFora = await page.locator('.wv2-pilot-chat').count()

await page.goto(`${B}/dashboard`, { waitUntil: 'networkidle' })
await page.waitForTimeout(7000)
await page.locator('.pilot-orb').first().tap()
await page.waitForTimeout(2000)
const abriuNoPainel = await page.locator('.wv2-pilot-chat').count()

abriuFora > 0 && abriuNoPainel > 0
  ? ok('o orbe abre o mesmo Pilot nas duas', 'a conversa é a mesma superfície')
  : no('o Pilot não abriu igual', `fora=${abriuFora} painel=${abriuNoPainel}`)

// ── 6. tocar fora fecha ─────────────────────────────────────────────────────
/*
 * D-140: o X continua existindo, mas não pode ser a única saída. O topo da tela
 * fica fora da folha mobile do Pilot, então tocar ali deve acionar o scrim.
 */
await page.touchscreen.tap(20, 20)
await page.waitForTimeout(700)
const fechouPorFora = await page.locator('.wv2-pilot-chat').count()
fechouPorFora === 0
  ? ok('tocar fora da janela fecha o Pilot')
  : no('tocar fora não fechou o Pilot', `${fechouPorFora} janela(s) ainda aberta(s)`)

// ── 7. e continua arrastável fora do dashboard ─────────────────────────────
/*
 * O dock é arrastável de propósito (D-079): um botão fixo num canto atrapalha
 * alguém — canhoto, tela grande, lista cujo conteúdo importante mora ali.
 * Unificar a APARÊNCIA não podia custar esse comportamento.
 */
await page.goto(`${B}/circles`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3500)
const antes = await page.locator('.pilot-orb').first().boundingBox()
await page.mouse.move(antes.x + antes.width / 2, antes.y + antes.height / 2)
await page.mouse.down()
await page.mouse.move(antes.x - 120, antes.y - 180, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(600)
const depois = await page.locator('.pilot-orb').first().boundingBox()
Math.abs(depois.x - antes.x) > 40 || Math.abs(depois.y - antes.y) > 40
  ? ok('fora do dashboard o orbe continua arrastável', `moveu ${Math.round(Math.abs(depois.x - antes.x))}×${Math.round(Math.abs(depois.y - antes.y))}px`)
  : no('o arraste do dock se perdeu', `de ${Math.round(antes.x)},${Math.round(antes.y)} para ${Math.round(depois.x)},${Math.round(depois.y)}`)

await browser.close()
stopServer()
console.log(`\n${pass} passaram, ${fail} falharam`)
await finish(fail)
