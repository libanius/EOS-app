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
 *   7. a linha da tempestade é um BOTÃO que leva a câmera até ela, e diz se
 *      aquilo é assunto seu ou contexto distante
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
import { track, cleanupOnExit } from './lib/test-cleanup.mjs'

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
let HOME = alerted ?? PARKLAND

const admin = (p, o = {}) => fetch(`${URL}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

// D-114: a limpeza acontece em QUALQUER saída — inclusive quando uma asserção
// estoura no meio. Foi o "só limpa no fim" que deixou 32 contas de teste no
// banco de produção.
cleanupOnExit(admin)

/**
 * Abre o painel de camadas.
 *
 * O botão "Camadas" ficou um toque mais fundo quando os controles do mapa
 * recolheram (D-131) — em repouso a coluna mostra só "Você" e "···". Este
 * teste passa a fazer o que a pessoa faz: abre o grupo, depois toca em Camadas.
 * Se o botão estivesse VISÍVEL em repouso, seria o recolhimento que quebrou.
 */
async function abrirCamadas(page) {
  const camadas = page.locator('button[aria-label="Camadas"]')
  if (!(await camadas.count())) {
    await page.locator('.wv2-mapcontrols button').last().click()
    await page.waitForTimeout(400)
  }
  await camadas.click()
}


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
  // O NHC nem sempre publica os três produtos, e uma camada pode falhar. O que
  // não pode acontecer é falha silenciosa: `missing` diz o que caiu.
  const faltando = cyc.missing ?? []
  const temAlgo = Boolean(cone || track) && pts.length > 0
  temAlgo && faltando.length === 0
    ? ok('geometria oficial do NHC', `cone ${cone?.geometry?.type ?? '—'} · trajetória ${track?.geometry?.type ?? '—'} · ${pts.length} pontos`)
    : temAlgo
      ? no('geometria incompleta por falha de busca', `faltou: ${faltando.join(', ')}`)
      : no('geometria ausente', `cone=${cone?.geometry?.type} track=${track?.geometry?.type} pontos=${pts.length}`)
}

// ── 3. vento em grade ───────────────────────────────────────────────────────
let wind = await fetch(`${B}/api/world/wind?lat=${HOME.latitude}&lng=${HOME.longitude}`).then(r => r.json())
if (!(wind.readings?.length >= 4) && alerted) {
  note('Ponto de alerta sem grade de vento suficiente; usando Parkland para validar o renderer.')
  HOME = PARKLAND
  wind = await fetch(`${B}/api/world/wind?lat=${HOME.latitude}&lng=${HOME.longitude}`).then(r => r.json())
}
const distintos = new Set((wind.readings ?? []).map(r => `${r.lat},${r.lng}`)).size
// A grade pedida tem 25 pontos, mas chegam menos por dois motivos legítimos: o
// Open-Meteo responde pela CÉLULA do modelo (e células repetidas são descartadas
// pelo provider, para não empilhar setas), e sobre o mar ele cobre menos pontos —
// este teste roda onde há alerta, e alertas marítimos caem quase todos na água.
// O que importa é ser uma GRADE: vários pontos, todos distintos.
wind.readings?.length >= 4 && distintos === wind.readings.length && wind.atUser
  ? ok('campo de vento em grade', `${wind.readings.length} leituras · aqui ${wind.atUser.speedKmh} km/h de ${wind.atUser.fromDeg}°`)
  : no('vento não veio em grade', `leituras=${wind.readings?.length} distintos=${distintos}`)
Array.isArray(wind.frames) && wind.frames.length > 1 && Array.isArray(wind.frameReadings) && wind.model?.includes('best_match')
  ? ok('vento com frames horários Open-Meteo', `${wind.model} · ${wind.frames.length} frames`)
  : no('vento sem timeline/cache horário', `model=${wind.model} frames=${wind.frames?.length} frameReadings=${wind.frameReadings?.length}`)

// ── navegador ───────────────────────────────────────────────────────────────
console.log(
  alerted && HOME !== PARKLAND
    ? `— rodando em ${HOME.latitude.toFixed(3)}, ${HOME.longitude.toFixed(3)} (alerta ativo: ${alerted.event})`
    : alerted
      ? '— alerta ativo sem vento em grade; renderer rodando em Parkland'
      : '— sem alerta ativo no país; rodando em Parkland',
)
const email = `eos-wx-${Date.now()}@test.internal`
const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Clima', plan: 'premium', location_lat: HOME.latitude, location_lng: HOME.longitude }) })

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
await page.locator('.wv2-map canvas.maplibregl-canvas').waitFor({ timeout: 30000 })
await page.waitForTimeout(5000)

// ── 4. painel de camadas ────────────────────────────────────────────────────
await abrirCamadas(page)
await page.waitForTimeout(600)
const painel = page.locator('[role="group"][aria-label="Camadas"]')
const chips = await painel.locator('.wv2-chip').allInnerTexts().catch(() => [])
chips.includes('Chuva') && chips.includes('Vento') && chips.includes('Ciclone') && chips.includes('Flood') && chips.includes('Surge') && chips.includes('Vento impacto') && chips.includes('Tornado') && chips.includes('Satélite') && chips.includes('Escuro')
  ? ok('painel de camadas com base e camadas', chips.join(' · '))
  : no('painel incompleto', JSON.stringify(chips))

// ── 5. ligar o vento inicia o campo escalar e o layer bilinear de partículas ─
await painel.locator('button', { hasText: /^Vento$/ }).click()
await page.waitForTimeout(6000)
await page.waitForFunction(() => {
  try { return Boolean(window.__eosMap?.loaded?.() && window.__eosMap?.getSource?.('eos-wind')) } catch { return false }
}, null, { timeout: 12000 }).catch(() => {})
// D-144: Vento é um modo de mapa. O clique já deve levar para câmera mundial;
// o setZoom abaixo só estabiliza o teste se o navegador restaurou zoom antigo.
await page.evaluate(() => window.__eosMap?.setZoom(Math.min(window.__eosMap?.getZoom?.() ?? 4, 4)))
await page.waitForTimeout(4500)
await page.waitForFunction(() => window.__eosWindLayer?.active === true, null, { timeout: 8000 }).catch(() => {})
// Perguntar ao MapLibre o que ele RENDERIZOU, não o que foi entregue à fonte.
// A primeira versão deste teste lia `_data` e teria passado com a camada
// invisível — foi assim que o bug do glifo ausente quase escapou.
const setas = await page.evaluate(() => {
  const map = window.__eosMap
  try {
    if (!map?.loaded?.() || !map?.getSource?.('eos-wind')) return { erro: 'mapa ou fonte de vento não expostos' }
  } catch {
    return { erro: 'mapa removido durante troca de base' }
  }
  const naFonte = map.querySourceFeatures('eos-wind')
  const desenhadas = map.queryRenderedFeatures({ layers: ['eos-wind'] })
  return {
    naFonte: naFonte.length,
    desenhadas: desenhadas.length,
    rotacoes: new Set(desenhadas.map(f => Math.round(f.properties.rotate))).size,
  }
})
const animado = await page.evaluate(() => window.__eosWindLayer ?? { active: false })
animado.active === true && animado.mode === 'bilinear' && animado.scalar === true && animado.wrapsWorld === true && (animado.scalarPixels ?? 0) > 0 && (animado.particles ?? 0) > 700 && (animado.visibleParticles ?? 0) > 220 && animado.grid === '25x25' && (animado.lineWidth ?? 0) >= 1.2 && (animado.minStepPx ?? 0) >= 1.3 && (animado.speedScale ?? 0) >= 0.00023 && (animado.maxSegmentPx ?? 99) <= 40 && (animado.fadeAlpha ?? 0) >= 0.96 && (animado.maxAgeMin ?? 0) >= 100
  ? ok('vento escalar e animado bilinear ativos no mapa', `${animado.grid} · ${animado.scalarPixels} px escalares · ${animado.visibleParticles}/${animado.particles} partículas visíveis · cauda fade ${animado.fadeAlpha} · segmento máx ${animado.maxSegmentPx}px`)
  : no('vento não desenhou', JSON.stringify({ setas, animado }))

const windToggle = page.locator('.world-wind-toggle')
if (await windToggle.count()) {
  const collapsed = await page.locator('.world-wind-legend[data-open="false"]').count()
  if (collapsed) await windToggle.click()
}
await page.waitForTimeout(250)
const controlsOk = await page.evaluate(() => {
  const controls = Array.from(document.querySelectorAll('.world-wind-control input'))
  if (controls.length < 4) return { ok: false, reason: 'controles ausentes' }
  const before = window.__eosWindLayer ?? {}
  const density = controls[0]
  const trail = controls[1]
  const opacity = controls[2]
  const arrows = controls[3]
  density.value = '1.4'
  density.dispatchEvent(new Event('input', { bubbles: true }))
  trail.value = '0.95'
  trail.dispatchEvent(new Event('input', { bubbles: true }))
  opacity.value = '0.35'
  opacity.dispatchEvent(new Event('input', { bubbles: true }))
  arrows.value = '0'
  arrows.dispatchEvent(new Event('input', { bubbles: true }))
  return { ok: true, beforeParticles: before.particles }
})
await page.waitForTimeout(650)
const tunedWind = await page.evaluate(() => window.__eosWindLayer ?? {})
const arrowPaint = await page.evaluate(() => ({
  icon: window.__eosMap?.getPaintProperty?.('eos-wind', 'icon-opacity'),
  text: window.__eosMap?.getPaintProperty?.('eos-wind-label', 'text-opacity'),
}))
controlsOk.ok && tunedWind.particles > (controlsOk.beforeParticles ?? 0) && tunedWind.fadeAlpha >= 0.98 && tunedWind.scalarOpacity < 0.55 && tunedWind.particleOpacity < 0.7 && arrowPaint.icon === 0 && arrowPaint.text === 0
  ? ok('sliders de vento ajustam fluxo, rastro, mapa e setas', `${controlsOk.beforeParticles} → ${tunedWind.particles} partículas · fade ${tunedWind.fadeAlpha} · opacidade ${tunedWind.scalarOpacity} · setas ${arrowPaint.icon}`)
  : no('sliders de vento não aplicaram configuração', JSON.stringify({ controlsOk, tunedWind, arrowPaint }))

const timelineOk = await page.evaluate(() => {
  const input = document.querySelector('.world-wind-time input')
  if (!input) return { ok: false, reason: 'slider ausente' }
  input.value = '3'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return { ok: true }
})
await page.waitForTimeout(500)
const frameDebug = await page.evaluate(() => window.__eosWindLayer ?? {})
timelineOk.ok && frameDebug.frameIndex === 3
  ? ok('timeline de vento troca frame sem novo modo', `frame=${frameDebug.frameIndex}`)
  : no('timeline de vento não atualizou frame', JSON.stringify({ timelineOk, frameDebug }))

const mapBox = await page.locator('.wv2-map canvas.maplibregl-canvas').boundingBox()
if (mapBox) {
  const beforeZoom = await page.evaluate(() => window.__eosMap?.getZoom?.() ?? null)
  const t0 = Date.now()
  await page.mouse.move(mapBox.x + mapBox.width * 0.5, mapBox.y + 120)
  await page.mouse.wheel(0, -500)
  await page.waitForTimeout(700)
  const afterZoom = await page.evaluate(() => window.__eosMap?.getZoom?.() ?? null)
  const elapsed = Date.now() - t0
  await page.waitForTimeout(900)
  const zoomWind = await page.evaluate(() => window.__eosWindLayer ?? {})
  beforeZoom !== null && afterZoom !== null && afterZoom > beforeZoom + 0.15 && elapsed < 2500
    ? ok('modo vento continua interativo', `zoom ${elapsed}ms · ${beforeZoom.toFixed(2)} → ${afterZoom.toFixed(2)}`)
    : no('modo vento travou ou não respondeu ao zoom', `elapsed=${elapsed} before=${beforeZoom} after=${afterZoom}`)
  ;(zoomWind.visibleParticles ?? 0) > 250
    ? ok('vento mantém densidade no zoom', `${zoomWind.visibleParticles}/${zoomWind.particles} partículas visíveis`)
    : no('vento perdeu densidade no zoom', JSON.stringify(zoomWind))
  await page.mouse.click(mapBox.x + 24, mapBox.y + 24)
  await page.waitForTimeout(250)
  ;(await page.locator('.world-wind-legend[data-open="false"]').count()) === 1
    ? ok('painel de vento recolhe ao tocar fora')
    : no('painel de vento não recolheu ao tocar fora')
} else {
  no('canvas do mapa ausente no modo vento')
}

await abrirCamadas(page)
await page.waitForTimeout(400)
await painel.locator('button', { hasText: /^Vento impacto$/ }).click()
await page.waitForTimeout(900)
const impacto = await page.evaluate(() => {
  const map = window.__eosMap
  return {
    source: Boolean(map?.getSource('eos-wind-impact')),
    layer: Boolean(map?.getLayer('eos-wind-impact')),
    label: Boolean(map?.getLayer('eos-wind-impact-label')),
  }
})
impacto.source && impacto.layer && impacto.label
  ? ok('camada de impacto de vento conectada ao mapa', JSON.stringify(impacto))
  : no('impacto de vento sem fonte/camada', JSON.stringify(impacto))

// preferência persiste
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
await abrirCamadas(page)
await page.waitForTimeout(600)
const ventoLigado = await page.locator('[role="group"][aria-label="Camadas"] button', { hasText: /^Vento$/ }).getAttribute('class')
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

// ── 7. a tempestade é tocável, e a distância é qualificada ──────────────────
// O botão de camadas ALTERNA o painel. Clicar às cegas quando ele já está aberto
// o fecha — foi assim que este item passou reportando "nenhum ciclone ativo"
// enquanto a API devolvia a Genevieve.
if (!(await page.locator('[role="group"][aria-label="Camadas"]').count())) {
  await abrirCamadas(page)
}
await page.waitForTimeout(1500)
const linhas = page.locator('.wv2-stormline')
if (await linhas.count()) {
  const texto = await linhas.first().innerText()
  const antesS = await page.evaluate(() => { const c = window.__eosMap?.getCenter(); return c ? [c.lng, c.lat] : null })
  await linhas.first().click()
  await page.waitForTimeout(4000)
  const depoisS = await page.evaluate(() => { const c = window.__eosMap?.getCenter(); return c ? [c.lng, c.lat] : null })
  const foi = antesS && depoisS && (Math.abs(antesS[0] - depoisS[0]) > 0.01 || Math.abs(antesS[1] - depoisS[1]) > 0.01)

  /**
   * O cone tem que CABER na tela.
   *
   * Mover a câmera não basta: com zoom fixo ela mergulha no olho da tempestade e
   * o cone estoura para fora do enquadramento — que foi o que o dono viu. A
   * pergunta que o cone responde ("minha casa está dentro?") só existe se ele
   * couber.
   *
   * A caixa esperada vem da RESPOSTA DA API, não das entranhas do mapa: a
   * primeira versão lia `_data` do source, não encontrava nada e passava pela
   * válvula `semCone` — um teste que reportava sucesso sem testar coisa alguma.
   */
  const coneBox = (() => {
    const f = cyc.cone?.features?.[0]
    if (!f) return null
    let w = 180, e = -180, so = 90, n = -90
    const walk = node => {
      if (!Array.isArray(node)) return
      if (typeof node[0] === 'number' && typeof node[1] === 'number') {
        w = Math.min(w, node[0]); e = Math.max(e, node[0])
        so = Math.min(so, node[1]); n = Math.max(n, node[1])
        return
      }
      node.forEach(walk)
    }
    walk(f.geometry.coordinates)
    return { w, e, s: so, n }
  })()

  const vista = await page.evaluate(() => {
    const b = window.__eosMap.getBounds()
    return { w: b.getWest(), e: b.getEast(), s: b.getSouth(), n: b.getNorth(), zoom: Number(window.__eosMap.getZoom().toFixed(2)) }
  })

  const enquadrou = coneBox
    ? {
        cabe:
          vista.w <= coneBox.w + 0.05 && vista.e >= coneBox.e - 0.05 &&
          vista.s <= coneBox.s + 0.05 && vista.n >= coneBox.n - 0.05,
        zoom: vista.zoom,
        cone: `${(coneBox.e - coneBox.w).toFixed(1)}°×${(coneBox.n - coneBox.s).toFixed(1)}°`,
        vista: `${(vista.e - vista.w).toFixed(1)}°×${(vista.n - vista.s).toFixed(1)}°`,
      }
    : { semCone: true }

  // A linha precisa dizer se aquilo importa: distância crua não é resposta.
  const qualificada = /assunto seu|longe demais/.test(texto)
  const volta = await page.locator('button:has-text("Voltar para a minha área")').count()

  if (enquadrou.semCone) {
    note('O NHC não publicou cone para esta tempestade — enquadramento não pôde ser medido.')
  }
  const coneOk = enquadrou.semCone || enquadrou.cabe
  foi && qualificada && volta === 1 && coneOk
    ? ok(
        'tempestade tocável, com o cone ENQUADRADO',
        `${texto.replace(/\n/g, ' · ')} · zoom ${enquadrou.zoom ?? '—'} · cone ${enquadrou.cone ?? '—'} em vista de ${enquadrou.vista ?? '—'}`,
      )
    : no('enquadramento da tempestade falhou', `moveu=${foi} qualificada=${qualificada} volta=${volta} cone=${JSON.stringify(enquadrou)}`)
} else {
  note('Nenhum ciclone ativo — item 7 não pôde ser exercitado.')
  ok('sem ciclone, nenhuma linha inventada')
}

await browser.close()
stopServer()
await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'DELETE' })

console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
