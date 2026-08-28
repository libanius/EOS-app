/**
 * Capturas para a ficha da Play Store (Faixa 1 / lançamento).
 *
 * Estas imagens são material de LOJA, e a política do Google é explícita: uma
 * captura tem de mostrar o app de verdade. Nada de mockup montado, nada de tela
 * que o produto não tem. Por isso este script fotografa a produção real
 * (`https://eos-app-fawn.vercel.app`) com um navegador de verdade.
 *
 * ── Por que uma conta de demonstração, e não a do dono ───────────────────
 *
 * A ficha da loja é pública e permanente. A conta do dono tem a posição ao vivo
 * da família, a ficha médica e os endereços de casa e da escola. Nada disso
 * pode virar imagem numa página aberta. Então o script cria uma conta própria,
 * semeia dados plausíveis e fictícios, fotografa e APAGA a conta ao final —
 * inclusive se estourar no meio (`cleanupOnExit`).
 *
 * ── Por que 1080×1920, e não a resolução do iPhone ──────────────────────
 *
 * O Play recusa captura cuja maior dimensão passe do DOBRO da menor. O viewport
 * de iPhone 14 Pro (390×844 @2x = 780×1688) dá razão 2,16 — reprovado na
 * validação, depois de todo o trabalho. 360×640 @3x dá 1080×1920, razão 1,78,
 * que é o formato recomendado — e 360×640 é tamanho de telefone Android real,
 * não um recorte inventado.
 *
 * USO:  node scripts/store-screenshots.mjs [pasta-de-saida]
 *       (padrão: ./store/screenshots)
 */
import fs from 'node:fs'
import { config } from 'dotenv'
import { chromium } from 'playwright'
import { track, cleanupOnExit } from './lib/test-cleanup.mjs'

config({ path: '.env.local' })

const BASE = process.env.BASE_URL || 'https://eos-app-fawn.vercel.app'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OUT = process.argv[2] || 'store/screenshots'

const EMAIL = `eos-store-${Date.now()}@test.internal`
const PASS = 'EosTest#2026!'

// Miami, FL: costa do Atlântico em plena temporada de furacão. É onde o mapa
// tem o que mostrar — cone, vento, alerta — em vez de um oceano vazio.
const LAT = 25.7617
const LNG = -80.1918

const admin = (path, opts = {}) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'return=representation',
      ...opts.headers,
    },
  })

cleanupOnExit(admin)

const log = (...a) => console.log(...a)

/**
 * Ir para uma rota e CONFERIR que se chegou nela.
 *
 * O EOS desvia o primeiro acesso de ficha incompleta para `/ficha`, uma vez só
 * (onboarding, 2026-07-22). Um `goto` ingênuo obedece ao desvio e o script segue
 * fotografando a tela errada sem reclamar — foi assim que a captura da Play
 * Store trouxe a Ficha Master no lugar do mapa, e este teste mediu uma tela que
 * não era a de Alertas. Como o desvio acontece UMA vez, a segunda navegação
 * chega. Se ainda assim não chegar, é para falhar alto, não seguir em silêncio.
 */
async function gotoOrFail(page, base, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  if (!page.url().includes(path)) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  }
  if (!page.url().includes(path)) {
    throw new Error(`nao cheguei em ${path} — parei em ${page.url()}`)
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })

  // ── conta de demonstração ────────────────────────────────────────────────
  const created = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true }),
  }).then(r => r.json())
  const uid = created.id
  if (!uid) throw new Error('falha ao criar usuário: ' + JSON.stringify(created).slice(0, 300))
  track.user(uid)
  log('✅ conta de demonstração criada')

  await admin(`/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'Família Ribeiro',
      location: 'Miami, FL',
      location_lat: LAT,
      location_lng: LNG,
      last_location_lat: LAT,
      last_location_lng: LNG,
      last_location_at: new Date().toISOString(),
      language: 'pt',
    }),
  })

  // Uma casa preparada, mas não perfeita: uma ficha com tudo verde não mostra
  // o produto — o EOS existe para apontar a lacuna, e a lacuna precisa aparecer.
  await admin('/rest/v1/resource_inventory', {
    method: 'POST',
    body: JSON.stringify({
      profile_id: uid,
      water_liters: 45,
      food_days: 5,
      fuel_liters: 20,
      battery_percent: 80,
      has_medical_kit: true,
      has_communication_device: false,
    }),
  })

  await admin('/rest/v1/family_members', {
    method: 'POST',
    body: JSON.stringify([
      { profile_id: uid, name: 'Helena', age: 7, is_infant: false, mobility_impaired: false },
      { profile_id: uid, name: 'Marina', age: 41, is_infant: false, mobility_impaired: false },
      { profile_id: uid, name: 'Vovó Alzira', age: 78, is_infant: false, mobility_impaired: true },
    ]),
  })
  log('✅ perfil, recursos e três pessoas semeados')

  // ── navegador ────────────────────────────────────────────────────────────
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3, // → 1080×1920
    isMobile: true,
    hasTouch: true,
    permissions: ['geolocation'],
    geolocation: { latitude: LAT, longitude: LNG },
    locale: 'pt-BR',
  })
  const page = await ctx.newPage()

  const shot = async (name, waitMs = 2500) => {
    await page.waitForTimeout(waitMs)
    const path = `${OUT}/${name}.png`
    await page.screenshot({ path })
    log(`📸 ${name}`)
  }

  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha|onboarding/, { timeout: 25000 }).catch(() => {})
  log('   login →', page.url())

  // 1. O mapa. O mapa carrega tile, terreno, clima e abrigo — 12 s não é
  // exagero, é o tempo real até a tela parar de mudar.
  await gotoOrFail(page, BASE, '/dashboard')
  await shot('01-mundo', 12000)

  // 2. A folha aberta: risco + prontidão na mesma tela.
  const grabber = page.locator('.wv2-grabber')
  if (await grabber.count()) {
    const box = await grabber.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + 8)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2, box.y - 240, { steps: 18 })
      await page.mouse.up()
      await shot('02-risco-e-prontidao', 2000)
    }
  } else log('   ⚠️  grabber não encontrado — pulando 02')

  // 3. O Pilot: o que diferencia o EOS de um app de clima.
  const orb = page.locator('.bar-orb')
  if (await orb.count()) {
    await orb.click()
    await shot('03-pilot', 3500)
    await page.keyboard.press('Escape').catch(() => {})
  } else log('   ⚠️  orbe do Pilot não encontrado — pulando 03')

  for (const [rota, nome, espera] of [
    ['/preparedness', '04-preparacao', 5000],
    ['/preparedness/o-que-falta', '05-o-que-falta', 4500],
    ['/preparedness/plano', '06-plano-da-familia', 5000],
    ['/family', '07-familia', 5000],
    ['/mais/treino', '08-treino', 5000],
    ['/dashboard/alertas', '09-alertas', 9000],
  ]) {
    await gotoOrFail(page, BASE, rota)
    await shot(nome, espera)
  }

  await browser.close()

  // ── conferência: o Play recusa o que não obedece ────────────────────────
  const { execSync } = await import('node:child_process')
  log('\n── validação das capturas ──')
  execSync(`python3 scripts/check-store-images.py ${OUT}`, { stdio: 'inherit' })
}

main()
  .then(() => log('\n✅ capturas em', OUT))
  .catch(e => { console.error('❌', e.message); process.exitCode = 1 })
