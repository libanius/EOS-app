/**
 * Percurso de usuário real no EOS, com navegador de verdade.
 * Cria uma conta, semeia dados plausíveis, e caminha pelo app tirando prints.
 */
import { config } from 'dotenv'
import { chromium } from 'playwright'

config({ path: '.env.local' })

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SHOT = process.argv[2] || '/tmp/eos-shots'

const EMAIL = `eos-walk-${Date.now()}@test.internal`
const PASS = 'EosTest#2026!'

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

const log = (...a) => console.log(...a)

async function main() {
  // ── 1. conta + dados plausíveis ─────────────────────────────────────────
  const created = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true }),
  }).then(r => r.json())
  const uid = created.id
  if (!uid) throw new Error('falha ao criar usuário: ' + JSON.stringify(created).slice(0, 300))
  log('✅ usuário criado', EMAIL)

  // Parkland, FL — mesma região que o dono usa
  await admin(`/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: 'Paulo (teste)', location: 'Bend, OR', location_lat: 44.0582, location_lng: -121.3153 }),
  })
  await admin('/rest/v1/resource_inventory', {
    method: 'POST',
    body: JSON.stringify({ profile_id: uid, water_liters: 40, food_days: 4, fuel_liters: 20, battery_percent: 70, has_medical_kit: true, has_communication_device: false }),
  })
  await admin('/rest/v1/family_members', {
    method: 'POST',
    body: JSON.stringify([
      { profile_id: uid, name: 'Isadora', age: 8, is_infant: false, mobility_impaired: false },
      { profile_id: uid, name: 'Ana', age: 39, is_infant: false, mobility_impaired: false },
    ]),
  })
  log('✅ perfil, inventário e família semeados')

  // ── 2. navegador ────────────────────────────────────────────────────────
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    permissions: ['geolocation'],
    geolocation: { latitude: 44.0582, longitude: -121.3153 },
    locale: 'pt-BR',
  })
  const page = await ctx.newPage()

  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 200)))

  const shot = async name => {
    await page.screenshot({ path: `${SHOT}/${name}.png` })
    log(`📸 ${name}`)
  }

  const _shotEarly = true
  // ── 3. login ────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  const btns = await page.locator('button').allTextContents()
  log('   botões no login:', btns.map(b => b.trim()).filter(Boolean).join(' | '))
  // O CTA é o último botão do card (os primeiros são o alternador de modo).
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha|onboarding/, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(3000)
  await shot('00-pos-login')
  log('   url após submit:', page.url())
  if (!/dashboard|ficha|onboarding/.test(page.url())) {
    log('   ⚠️  não navegou; tentando /dashboard direto')
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  }
  log('✅ login →', page.url())

  // ── 4. dashboard ────────────────────────────────────────────────────────
  if (!page.url().includes('/dashboard')) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  }
  await page.waitForTimeout(9000) // mapa + clima + abrigos
  await shot('01-dashboard')

  // sheet: arrastar o grabber
  const grabber = page.locator('.wv2-grabber')
  if (await grabber.count()) {
    const box = await grabber.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y - 260, { steps: 18 })
    await page.mouse.up()
    await page.waitForTimeout(1200)
    await shot('02-sheet-arrastado')
  } else log('⚠️  grabber do sheet não encontrado')

  // Pilot
  const orb = page.locator('.wv2-pilot-orb')
  if (await orb.count()) {
    await orb.click()
    await page.waitForTimeout(1200)
    await shot('03-pilot-aberto')
    const chips = await page.locator('.pilot-chip').allTextContents()
    log('   chips do Pilot:', chips.join(' | '))
    const headline = await page.locator('.pilot-headline').first().textContent().catch(() => null)
    log('   resposta:', headline)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
  } else log('⚠️  orbe do Pilot não encontrado')

  // busca
  const search = page.locator('.wv2-search input')
  if (await search.count()) {
    await search.fill('Coral Springs')
    await search.press('Enter')
    await page.waitForTimeout(4000)
    await shot('04-busca')
    const hits = await page.locator('.search-hit').count()
    log('   resultados de busca:', hits)
    if (hits) { await page.locator('.search-hit').first().click(); await page.waitForTimeout(2500); await shot('05-busca-selecionada') }
  } else log('⚠️  campo de busca não encontrado')

  // ── 5. SIMULADOR ────────────────────────────────────────────────────────
  await page.goto(`${BASE}/scenario`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  await shot('06-simulador')

  const ta = page.locator('.sim-textarea')
  if (await ta.count()) {
    await ta.fill('Furacão categoria 3 em 12 horas. Minha filha machucou o joelho e não anda rápido.')
  }
  // Furacão / severidade 3 / 12h / mobilidade limitada / energia cortada
  await page.locator('.sim-chip', { hasText: 'Furacão' }).first().click()
  await page.locator('.sim-scale button').nth(2).click()
  await page.locator('.sim-chip', { hasText: '12h' }).first().click()
  await page.locator('.sim-toggle', { hasText: 'Energia cortada' }).first().click()
  await page.locator('.sim-toggle', { hasText: 'não consegue se locomover' }).first().click()
  await page.waitForTimeout(600)
  await shot('07-simulador-configurado')

  await page.locator('button:has-text("Iniciar simulação")').first().click()
  await page.waitForTimeout(7000)
  log('   url após iniciar:', page.url())
  await shot('08-dashboard-EM-SIMULACAO')

  const banner = await page.locator('.sim-banner').innerText().catch(() => null)
  log('   faixa de simulação:', banner ? banner.replace(/\n/g, ' / ') : 'AUSENTE ❌')
  const score = await page.locator('.sheet-summary strong, .wv2-grabber strong').first().innerText().catch(() => '?')
  log('   índice de risco na simulação:', score)

  const orb2 = page.locator('.wv2-pilot-orb')
  if (await orb2.count()) {
    await orb2.click(); await page.waitForTimeout(1500)
    await shot('09-pilot-em-simulacao')
    log('   Pilot:', await page.locator('.pilot-headline').first().textContent().catch(() => '?'))
    log('   veredito:', await page.locator('.pilot-verdict').first().textContent().catch(() => '?'))
  }

  // encerrar
  await page.locator('.sim-banner button').click().catch(() => {})
  await page.waitForTimeout(2500)
  await shot('10-apos-encerrar')
  log('   faixa após encerrar:', await page.locator('.sim-banner').count() ? 'ainda presente ❌' : 'removida ✅')

  // ── 6. CHECKLIST redesenhado ────────────────────────────────────────────
  await page.goto(`${BASE}/checklist`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3500)
  await shot('11-checklist')
  log('   kits:', (await page.locator('.list-kit').allTextContents()).join(' | '))
  log('   prontidão:', await page.locator('.list-progress .t-figure').first().textContent().catch(() => '?'))

  // ── 7. PILOT como conversa ──────────────────────────────────────────────
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(8000)
  const orb3 = page.locator('.wv2-pilot-orb')
  if (await orb3.count()) {
    await orb3.click()
    await page.waitForTimeout(1800)
    await shot('12-pilot-conversa')
    log('   tom exibido:', await page.locator('.chat-id em').first().textContent().catch(() => '?'))
    log('   1a mensagem:', await page.locator('.chat-headline').first().textContent().catch(() => '?'))
    // toca numa pergunta sugerida (motor local, sem rede)
    await page.locator('.chat-suggestions .pilot-chip').nth(2).click()
    await page.waitForTimeout(1200)
    await shot('13-pilot-pergunta-local')
    log('   msgs no fluxo:', await page.locator('.chat-pilot, .chat-user').count())
    log('   campo de texto presente:', await page.locator('.chat-compose input').count())

    // A pergunta que expôs a falha: o Pilot tem os dados ao vivo?
    await page.locator('.chat-compose input').fill('qual é a temperatura agora?')
    await page.locator('.chat-compose button[type=submit]').click()
    await page.waitForTimeout(22000)
    await shot('14-pilot-temperatura')
    const last = await page.locator('.chat-pilot').last().innerText().catch(() => '?')
    log('\n   RESPOSTA SOBRE TEMPERATURA:\n   ' + last.replace(/\n/g, '\n   '))

    // D-068: posições e navegação
    await page.locator('.chat-compose input').fill('home depot perto de mim')
    await page.locator('.chat-compose button[type=submit]').click()
    await page.waitForTimeout(25000)
    await shot('15-pilot-coordenadas')
    const geo = await page.locator('.chat-pilot').last().innerText().catch(() => '?')
    log('\n   RESPOSTA (home depot):\n   ' + geo.replace(/\n/g, '\n   '))
    log('   JSON cru vazou?', /\{\s*"reply"|"tasks"\s*:/.test(geo) ? 'SIM ❌' : 'não ✅')
    log('   respondeu em português?', /\b(está|fica|você|mais próxim|km)\b/i.test(geo) ? 'sim ✅' : 'verificar')
    log('   destinos propostos:', await page.locator('.chat-destination').count())
    log('   ações por destino:', (await page.locator('.chat-destination .go > *').allTextContents()).join(' | '))

    // D-069: o trajeto tem de aparecer DENTRO do EOS
    const showBtn = page.locator('.chat-destination .go > .primary').first()
    if (await showBtn.count()) {
      await showBtn.click()
      await page.waitForTimeout(4500)
      await shot('16-curso-no-mapa-EOS')
      const drawn = await page.evaluate(() => !!document.querySelector('.w-mapmarker.destination'))
      log('   pino de destino no mapa EOS:', drawn ? 'sim ✅' : 'não ❌')
      log('   Pilot fechou para revelar o mapa:', (await page.locator('.wv2-pilot-chat').count()) === 0 ? 'sim ✅' : 'não ❌')
    } else log('   ⚠️  sem botão Ver no mapa')
  } else log('⚠️  orbe não encontrado')

  log('\n─── erros de console ───')
  log(errors.length ? errors.slice(0, 10).join('\n') : '  nenhum')

  await browser.close()
  await admin(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' })
  log('\n🧹 usuário de teste removido')
}

main().catch(e => { console.error('💥', e.message); process.exit(1) })
