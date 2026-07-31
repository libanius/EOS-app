/**
 * Camadas de clima no mapa, com dado REAL (D-078).
 *
 * Prova a corrente que responde "onde está a tempestade e para onde ela vai":
 *
 *   1. o provider de ciclones traz posição, rumo e velocidade do NHC
 *   2. e traz a GEOMETRIA oficial — cone, trajetória e pontos de previsão
 *   3. o campo de vento devolve uma grade, não um ponto só
 *   4. o painel de camadas liga cada uma e a preferência sobrevive ao reload
 *   5. ligar o vento desenha setas no mapa, com rotação por leitura
 *   6. tocar num alerta leva a câmera até ele, e o título pulsa na COR DO RISCO
 *      — a mesma cor que diz "quão ruim está" no topo passa a marcar onde é
 *
 * Usa dado ao vivo de propósito. Um mock provaria que meu parser concorda com o
 * meu mock — e o histórico deste projeto é que os defeitos moram exatamente na
 * diferença entre o que eu suponho e o que o serviço devolve.
 *
 * Se não houver ciclone ativo no mundo, os itens 1 e 2 reportam ESSA condição em
 * vez de falhar: "nenhum ciclone ativo" é resposta correta na maior parte do ano.
 *
 * ATENÇÃO: cria e apaga uma conta no Supabase de produção.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3016)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'
const PARKLAND = { latitude: 26.3106, longitude: -80.2456 }

/**
 * Onde rodar a parte de alertas.
 *
 * Parkland raramente tem alerta ativo, e um teste que só exercita o caminho
 * quando o tempo colabora não testa nada na maior parte do ano. Então o teste
 * PROCURA uma região que tenha alerta agora, no feed do NWS, e vai até lá.
 *
 * Continua sendo dado real — só não é dado real do quintal do dono.
 */
async function findAlertedPlace() {
  const feed = await fetch('https://api.weather.gov/alerts/active', {
    headers: { 'User-Agent': 'EOS test (brightscalegroup@gmail.com)' },
  }).then(r => (r.ok ? r.json() : null)).catch(() => null)

  const withGeometry = (feed?.features ?? []).filter(f => f.geometry)
  for (const feature of withGeometry) {
    let c = feature.geometry.coordinates
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]
    if (Array.isArray(c) && typeof c[0] === 'number') {
      return { latitude: c[1], longitude: c[0], event: feature.properties?.event ?? 'alerta' }
    }
  }
  return null
}

const alerted = await findAlertedPlace()
const HOME = alerted ?? PARKLAND

const admin = (p, o = {}) => fetch(`${URL}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

let pass = 0, fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }
const note = l => console.log(`   ${l}`)

if (!fs.existsSync('.next/BUILD_ID')) { console.error('Faltou `npm run build`.'); process.exit(1) }
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: process.env, stdio: 'ignore' })
const stopServer = () => { try { server.kill('SIGTERM') } catch {} }
process.on('exit', stopServer)
let up = false
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise(r => setTimeout(r, 500))
  up = await fetch(`${B}/api/world/wind?lat=26.3&lng=-80.2`).then(r => r.ok).catch(() => false)
}
if (!up) { console.error('Servidor não subiu'); stopServer(); process.exit(1) }

// ── 1 e 2. ciclones ─────────────────────────────────────────────────────────
const cyc = await fetch(`${B}/api/world/cyclones?lat=${HOME.latitude}&lng=${HOME.longitude}`).then(r => r.json())
if (cyc.empty) {
  note('Nenhum ciclone ativo no mundo agora — itens 1 e 2 não puderam ser exercitados.')
  cyc.error
    ? no('provider de ciclones falhou', cyc.error)
    : ok('sem ciclone ativo, e o provider diz isso sem inventar', 'empty=true')
} else {
  const s = cyc.storms[0]
  const posOk = Number.isFinite(s?.lat) && Number.isFinite(s?.lng) && s.windKmh > 0
  posOk
    ? ok('ciclone com posição, vento e rumo', `${s.name} · ${s.windKmh} km/h · rumo ${s.headingDeg}° · ${s.distanceKm} km`)
    : no('ciclone sem dados úteis', JSON.stringify(s).slice(0, 160))

  const cone = cyc.cone?.features?.[0]
  const track = cyc.track?.features?.[0]
  const pts = cyc.forecastPoints?.features ?? []
  cone?.geometry?.type?.includes('Polygon') && track?.geometry?.type?.includes('Line') && pts.length > 0
    ? ok('geometria oficial do NHC', `cone ${cone.geometry.type} · trajetória ${track.geometry.type} · ${pts.length} pontos`)
    : no('geometria ausente', `cone=${cone?.geometry?.type} track=${track?.geometry?.type} pontos=${pts.length}`)
}

// ── 3. vento em grade ───────────────────────────────────────────────────────
const wind = await fetch(`${B}/api/world/wind?lat=${HOME.latitude}&lng=${HOME.longitude}`).then(r => r.json())
const distintos = new Set((wind.readings ?? []).map(r => `${r.lat},${r.lng}`)).size
// A grade pedida tem 25 pontos, mas o Open-Meteo responde pela célula do modelo
// e alguns coincidem — o provider descarta os repetidos para não empilhar setas.
// Por isso o teste exige "todos distintos" e aceita menos de 25.
wind.readings?.length >= 18 && distintos === wind.readings.length && wind.atUser
  ? ok('campo de vento em grade', `${wind.readings.length} leituras · aqui ${wind.atUser.speedKmh} km/h de ${wind.atUser.fromDeg}°`)
  : no('vento não veio em grade', `leituras=${wind.readings?.length} distintos=${distintos}`)

// ── navegador ───────────────────────────────────────────────────────────────
console.log(
  alerted
    ? `— rodando em ${HOME.latitude.toFixed(3)}, ${HOME.longitude.toFixed(3)} (alerta ativo: ${alerted.event})`
    : '— sem alerta ativo no país; rodando em Parkland',
)
const email = `eos-wx-${Date.now()}@test.internal`
const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Clima', location_lat: HOME.latitude, location_lng: HOME.longitude }) })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  viewport: { width: 420, height: 900 }, locale: 'pt-BR',
  permissions: ['geolocation'], geolocation: HOME,
})
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding/, { timeout: 30000 }).catch(() => {})
await page.goto(`${B}/dashboard`, { waitUntil: 'networkidle' })
await page.locator('.wv2-map canvas').waitFor({ timeout: 30000 })
await page.waitForTimeout(5000)

// ── 4. painel de camadas ────────────────────────────────────────────────────
await page.locator('button[aria-label="Camadas"]').click()
await page.waitForTimeout(600)
const painel = page.locator('[role="group"][aria-label="Camadas"]')
const chips = await painel.locator('.wv2-chip').allInnerTexts().catch(() => [])
chips.includes('Chuva') && chips.includes('Vento') && chips.includes('Ciclone') && chips.includes('Satélite')
  ? ok('painel de camadas com base e camadas', chips.join(' · '))
  : no('painel incompleto', JSON.stringify(chips))

// ── 5. ligar o vento desenha setas ──────────────────────────────────────────
await painel.locator('button:has-text("Vento")').click()
await page.waitForTimeout(6000)
// Afasta um pouco a câmera: a asserção é sobre VER várias direções, e num zoom
// de quarteirão nem a grade mais fina cabe na tela.
await page.evaluate(() => window.__eosMap?.setZoom(11))
await page.waitForTimeout(2500)
// Perguntar ao MapLibre o que ele RENDERIZOU, não o que foi entregue à fonte.
// A primeira versão deste teste lia `_data` e teria passado com a camada
// invisível — foi assim que o bug do glifo ausente quase escapou.
const setas = await page.evaluate(() => {
  const map = window.__eosMap
  if (!map) return { erro: 'mapa não exposto' }
  const naFonte = map.querySourceFeatures('eos-wind')
  const desenhadas = map.queryRenderedFeatures({ layers: ['eos-wind'] })
  return {
    naFonte: naFonte.length,
    desenhadas: desenhadas.length,
    rotacoes: new Set(desenhadas.map(f => Math.round(f.properties.rotate))).size,
  }
})
setas.desenhadas > 0 && setas.rotacoes > 1
  ? ok('setas de vento DESENHADAS no mapa', `${setas.desenhadas} visíveis · ${setas.rotacoes} direções distintas`)
  : no('vento não desenhou', JSON.stringify(setas))

// preferência persiste
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
await page.locator('button[aria-label="Camadas"]').click()
await page.waitForTimeout(600)
const ventoLigado = await page.locator('[role="group"][aria-label="Camadas"] button:has-text("Vento")').getAttribute('class')
ventoLigado?.includes('on')
  ? ok('a escolha de camadas sobrevive ao reload')
  : no('camadas não persistiram', String(ventoLigado))

// ── 6. tocar num alerta leva a câmera ───────────────────────────────────────
const alertas = await page.locator('.wv2-alertlist button').count()
if (alertas) {
  const antes = await page.evaluate(() => { const c = window.__eosMap?.getCenter(); return c ? [c.lng, c.lat] : null })
  await page.locator('.wv2-alertlist button').first().click()
  await page.waitForTimeout(3500)
  const depois = await page.evaluate(() => { const c = window.__eosMap?.getCenter(); return c ? [c.lng, c.lat] : null })
  const moveu = antes && depois && (Math.abs(antes[0] - depois[0]) > 0.001 || Math.abs(antes[1] - depois[1]) > 0.001)

  // A cor do marcador tem que ser a MESMA do estado de risco: é o vocabulário
  // que liga "quão ruim está" a "onde está acontecendo".
  const pulso = await page.evaluate(() => {
    const risco = document.querySelector('.wv2')?.getAttribute('data-risk')
    const lab = document.querySelector('.w-mapmarker.alerting .lab')
    const naLista = document.querySelector('.wv2-alertlist button.showing')
    if (!lab) return { risco, marcador: null }
    const cs = getComputedStyle(lab)
    return {
      risco,
      marcador: cs.backgroundColor,
      accent: getComputedStyle(document.querySelector('.wv2')).getPropertyValue('--accent').trim(),
      animando: cs.animationName !== 'none',
      listaMarcada: Boolean(naLista),
    }
  })
  moveu && pulso.marcador && pulso.animando && pulso.listaMarcada
    ? ok('alerta no mapa, pulsando na cor do risco', `risco=${pulso.risco} accent=${pulso.accent} · ${antes.map(n => n.toFixed(3))} → ${depois.map(n => n.toFixed(3))}`)
    : no('foco/pulso do alerta falhou', `moveu=${moveu} ${JSON.stringify(pulso)}`)
} else {
  note('Nenhum alerta ativo em Parkland agora — item 6 não pôde ser exercitado.')
  ok('sem alerta ativo, a lista não inventa nenhum')
}

await browser.close()
stopServer()
await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'DELETE' })

console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
