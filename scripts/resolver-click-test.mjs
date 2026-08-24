import { config } from 'dotenv'
import { chromium } from 'playwright'

config({ path: '.env.local' })

const BASE = 'http://127.0.0.1:3000'
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = `eos-resolver-${Date.now()}@test.internal`
const PASS = 'EosTest#2026!'

if (!URL || !KEY) throw new Error('Missing Supabase env')

const admin = (path, opts = {}) => fetch(`${URL}${path}`, {
  ...opts,
  headers: {
    'Content-Type': 'application/json',
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    Prefer: 'return=representation',
    ...opts.headers,
  },
})

let uid = null
const browser = await chromium.launch()

try {
  const created = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true }),
  }).then(r => r.json())
  if (!created.id) throw new Error(`create user failed: ${JSON.stringify(created).slice(0, 300)}`)
  uid = created.id

  await admin('/rest/v1/profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      id: uid,
      name: 'Resolver Test',
      location: 'Parkland, FL',
      location_lat: 26.3106,
      location_lng: -80.2456,
    }),
  })

  await admin('/rest/v1/resource_inventory', {
    method: 'POST',
    body: JSON.stringify({
      profile_id: uid,
      water_liters: 2,
      food_days: 1,
      fuel_liters: 0,
      battery_percent: 20,
      has_medical_kit: false,
      has_communication_device: false,
    }),
  })

  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'pt-BR' })
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha|onboarding/, { timeout: 20000 }).catch(() => {})
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.wv2-worse-handle', { timeout: 20000 })
  const before = page.url()
  await page.locator('.wv2-worse-handle').first().click()
  await page.waitForURL(/\/preparedness/, { timeout: 10000 })
  console.log(JSON.stringify({ ok: true, before, after: page.url() }))
} finally {
  await browser.close().catch(() => null)
  if (uid) await admin(`/auth/v1/admin/users/${uid}`, { method: 'DELETE' }).catch(() => null)
}
