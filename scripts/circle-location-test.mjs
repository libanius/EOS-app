/** Dois navegadores, um círculo: a esposa liga o toggle, o Paulo a vê no mapa. */
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const B = 'http://localhost:3000', PASS = 'EosTest#2026!'
const admin = (p, o={}) => fetch(`${URL}${p}`, {...o, headers:{'Content-Type':'application/json',apikey:KEY,Authorization:`Bearer ${KEY}`,Prefer:'return=representation',...o.headers}})

async function mkUser(name, lat, lng) {
  const email = `eos-${name.toLowerCase()}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password:PASS,email_confirm:true})}).then(r=>r.json())
  await admin(`/rest/v1/profiles?id=eq.${u.id}`,{method:'PATCH',body:JSON.stringify({name,location:'Parkland, FL',location_lat:lat,location_lng:lng})})
  return { id:u.id, email, name }
}
async function login(browser, user, lat, lng) {
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true,
    permissions:['geolocation'], geolocation:{latitude:lat,longitude:lng}, locale:'pt-BR' })
  // O redirect de primeiro acesso para /ficha atrapalha o teste; marcamos a
  // flag que o FichaFirstRun usa para não interceptar.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {}
  })
  const page = await ctx.newPage()
  await page.goto(`${B}/auth/login`,{waitUntil:'networkidle'})
  await page.fill('input[type="email"]', user.email)
  await page.fill('input[type="password"]', PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha|onboarding/,{timeout:30000}).catch(()=>{})
  return page
}

const paulo = await mkUser('Paulo', 26.3101, -80.2373)
const esposa = await mkUser('Esposa', 26.3150, -80.2400)
const circle = await admin('/rest/v1/circles',{method:'POST',body:JSON.stringify({name:'Família Teste',leader_id:paulo.id,invite_code:`T${Date.now()%100000}`})}).then(r=>r.json())
const cid = circle[0].id
await admin('/rest/v1/circle_members',{method:'POST',body:JSON.stringify([
  {circle_id:cid,user_id:paulo.id,role:'Admin',share_inventory:true,shared_fields:[]},
  {circle_id:cid,user_id:esposa.id,role:'Editor',share_inventory:true,shared_fields:[]},
])})
console.log('✅ dois usuários num círculo')

const browser = await chromium.launch()

// ── A esposa liga o toggle de localização, pela UI ──
const wife = await login(browser, esposa, 26.3150, -80.2400)
await wife.goto(`${B}/circles`,{waitUntil:'networkidle'})
await wife.waitForTimeout(5000)
const toggle = wife.locator('label:has-text("Compartilhar minha localização") input')
console.log('toggle de localização visível:', await toggle.count() ? 'sim ✅' : 'NÃO ❌')
if (await toggle.count()) {
  await toggle.first().check()
  await wife.waitForTimeout(3000)
}
await wife.screenshot({path:'/tmp/eos-shots/20-esposa-toggle.png'})

const saved = await admin(`/rest/v1/circle_members?circle_id=eq.${cid}&user_id=eq.${esposa.id}&select=shared_fields`).then(r=>r.json())
const fields = saved[0]?.shared_fields ?? []
console.log('shared_fields gravado:', JSON.stringify(fields))
console.log("'location' PERSISTIU:", fields.includes('location') ? 'sim ✅' : 'NÃO ❌')

// ── O Paulo abre o mapa ──
const p = await login(browser, paulo, 26.3101, -80.2373)
await p.goto(`${B}/dashboard`,{waitUntil:'networkidle'})
await p.waitForTimeout(14000)
const markers = await p.locator('.w-mapmarker.real .lab').allTextContents()
console.log('marcadores de família no mapa do Paulo:', markers.length ? markers.join(' | ') : '(nenhum)')
console.log('PAULO VÊ A ESPOSA:', markers.some(m => /esposa/i.test(m)) ? 'sim ✅' : 'NÃO ❌')
await p.screenshot({path:'/tmp/eos-shots/21-paulo-ve-esposa.png'})

// ── O campo de conversa do Pilot fica acima da barra inferior? ──
await p.locator('.bar-orb').click()
await p.waitForTimeout(2000)
const input = p.locator('.chat-compose input')
const box = await input.boundingBox().catch(()=>null)
const nav = await p.locator('nav.nav').boundingBox().catch(()=>null)
console.log('campo de conversa visível:', await input.isVisible().catch(()=>false) ? 'sim ✅' : 'NÃO ❌')
console.log('campo ACIMA da barra inferior:', box && nav && (box.y + box.height) <= nav.y + 2 ? 'sim ✅' : 'NÃO ❌')
await input.fill('teste')
console.log('consegue digitar:', (await input.inputValue()) === 'teste' ? 'sim ✅' : 'NÃO ❌')
await p.screenshot({path:'/tmp/eos-shots/22-pilot-campo-celular.png'})

await browser.close()
await admin(`/auth/v1/admin/users/${paulo.id}`,{method:'DELETE'})
await admin(`/auth/v1/admin/users/${esposa.id}`,{method:'DELETE'})
console.log('🧹 limpo')
