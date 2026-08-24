/**
 * WV2-T05: reproducible production-readiness audit for the World v2 dashboard.
 *
 * Requires a running app at BASE_URL (default http://localhost:3000) and the
 * Supabase service role env vars from .env.local. Creates and deletes one
 * confirmed test user.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { config } from 'dotenv'
import { chromium } from 'playwright'

config({ path: '.env.local' })

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = `eos-wv2-${Date.now()}@test.internal`
const PASS = 'EosTest#2026!'
const OUT = `artifacts/world-v2-validation-${Date.now()}.json`

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

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

function assert(ok, message) {
  if (!ok) throw new Error(message)
}

async function createUser() {
  const created = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true }),
  }).then(r => r.json())
  assert(created.id, `Could not create test user: ${JSON.stringify(created).slice(0, 300)}`)

  const uid = created.id
  await admin('/rest/v1/profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      id: uid,
      name: 'WV2 Validation',
      location: 'Bend, OR',
      location_lat: 44.0582,
      location_lng: -121.3153,
      blood_type: 'O+',
      allergies: ['none'],
      medical_notes: 'No known constraints for automated validation.',
      medications: [],
      emergency_contact_name: 'Validation Contact',
      emergency_contact_phone: '+15555550100',
    }),
  })
  await admin('/rest/v1/resource_inventory', {
    method: 'POST',
    body: JSON.stringify({
      profile_id: uid,
      water_liters: 24,
      food_days: 3,
      fuel_liters: 12,
      battery_percent: 65,
      has_medical_kit: true,
      has_communication_device: true,
    }),
  })
  return uid
}

async function login(page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha|onboarding/, { timeout: 20000 }).catch(() => {})
  if (!page.url().includes('/dashboard')) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  }
}

async function auditViewport(browser, label, viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: viewport.width < 700 ? 2 : 1,
    isMobile: viewport.width < 700,
    hasTouch: viewport.width < 700,
    permissions: ['geolocation'],
    geolocation: { latitude: 44.0582, longitude: -121.3153 },
    locale: 'pt-BR',
  })
  await context.addInitScript(() => {
    window.localStorage.setItem('eos-ficha-firstrun', '1')
  })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 240))
  })
  page.on('pageerror', err => consoleErrors.push(`PAGEERROR: ${String(err).slice(0, 240)}`))

  await login(page)
  await page.waitForTimeout(9000)

  const checks = await page.evaluate(() => {
    const visible = el => {
      const style = window.getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
    }
    const nameOf = el =>
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.getAttribute('placeholder') ||
      el.textContent ||
      ''
    const controls = Array.from(document.querySelectorAll('button,a,input,select,textarea,[role="button"]'))
      .filter(visible)
      .filter(el => !el.closest('.maplibregl-ctrl-attrib'))
    const unnamedControls = controls
      .filter(el => !nameOf(el).trim())
      .map(el => el.outerHTML.slice(0, 160))
    const smallTargets = controls
      .map(el => {
        const rect = el.getBoundingClientRect()
        return { html: el.outerHTML.slice(0, 120), width: Math.round(rect.width), height: Math.round(rect.height) }
      })
      .filter(item => item.width < 40 || item.height < 40)
    const nav = performance.getEntriesByType('navigation')[0]
    const resources = performance.getEntriesByType('resource')
    const hosts = [...new Set(resources.map(entry => {
      try { return new URL(entry.name).host } catch { return 'local' }
    }))].sort()
    const transferBytes = resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0)
    return {
      url: window.location.href,
      bodyText: document.body.innerText.slice(0, 500),
      hasMain: Boolean(document.querySelector('main')),
      hasStatusText: Boolean(document.querySelector('.wv2-sr[role="status"]')),
      hasProvenance: Boolean(document.querySelector('.wv2-provenance')),
      mapHiddenFromScreenReader: Boolean(document.querySelector('.world-map-wrap[aria-hidden="true"]')),
      unnamedControls,
      smallTargets: smallTargets.slice(0, 20),
      controlCount: controls.length,
      navigationMs: nav ? Math.round(nav.loadEventEnd || nav.duration || 0) : null,
      resourceCount: resources.length,
      transferBytes,
      hosts,
      title: document.title,
    }
  })

  await context.close()
  return { label, viewport, consoleErrors, checks }
}

async function main() {
  let uid = null
  const result = {
    baseUrl: BASE,
    generatedAt: new Date().toISOString(),
    providerCostPosture: {
      mapBase: process.env.NEXT_PUBLIC_MAPTILER_KEY
        ? 'MapTiler key configured: hybrid base can become billable under the MapTiler account.'
        : 'No MapTiler key configured: default map base is keyless CARTO dark; satellite option uses ESRI public raster tiles with attribution.',
      weather: 'Open-Meteo, NWS, USGS, NHC and RainViewer paths are keyless in this code path; credentialed hazard adapters report not_configured until keys exist.',
      ai: 'OpenAI calls are not made by dashboard load itself; Pilot/geocoding/simulation AI flows are submit-driven.',
    },
  }
  try {
    uid = await createUser()
    const browser = await chromium.launch()
    result.viewports = [
      await auditViewport(browser, 'mobile', { width: 390, height: 844 }),
      await auditViewport(browser, 'desktop', { width: 1440, height: 960 }),
    ]
    await browser.close()

    for (const item of result.viewports) {
      assert(item.consoleErrors.length === 0, `${item.label}: console errors: ${item.consoleErrors.join(' | ')}`)
      assert(item.checks.hasMain, `${item.label}: missing main element at ${item.checks.url}: ${item.checks.bodyText}`)
      assert(item.checks.hasStatusText, `${item.label}: missing textual status equivalent`)
      assert(item.checks.hasProvenance, `${item.label}: missing provenance text`)
      assert(item.checks.mapHiddenFromScreenReader, `${item.label}: visual map should be aria-hidden`)
      assert(item.checks.unnamedControls.length === 0, `${item.label}: controls without accessible names`)
      assert((item.checks.navigationMs ?? 0) < 30000, `${item.label}: navigation took too long`)
    }

    await mkdir('artifacts', { recursive: true })
    await writeFile(OUT, JSON.stringify(result, null, 2))
    console.log(`WV2 validation passed: ${OUT}`)
    for (const item of result.viewports) {
      console.log(`${item.label}: ${item.checks.navigationMs}ms, ${item.checks.resourceCount} resources, ${Math.round(item.checks.transferBytes / 1024)}KB transferred`)
      if (item.checks.smallTargets.length) console.log(`${item.label}: small target warnings=${item.checks.smallTargets.length}`)
    }
  } finally {
    if (uid) await admin(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' }).catch(() => null)
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
