/**
 * Três contas, dois círculos e um convidado de fora (D-072).
 *
 * ATENÇÃO: cria e apaga contas no Supabase de PRODUÇÃO — é o único projeto
 * configurado no .env.local. A limpeza remove conta E perfil.
 */
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })
const URL=process.env.NEXT_PUBLIC_SUPABASE_URL, KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
const B='http://localhost:3000', PASS='EosTest#2026!'
const admin=(p,o={})=>fetch(`${URL}${p}`,{...o,headers:{'Content-Type':'application/json',apikey:KEY,Authorization:`Bearer ${KEY}`,Prefer:'return=representation',...o.headers}})

async function mkUser(name){
  const email=`eos-shr-${name.toLowerCase()}-${Date.now()}@test.internal`
  const u=await admin('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password:PASS,email_confirm:true})}).then(r=>r.json())
  await admin(`/rest/v1/profiles?id=eq.${u.id}`,{method:'PATCH',body:JSON.stringify({name,location_lat:26.3101,location_lng:-80.2373})})
  return {id:u.id,email,name}
}
async function login(browser,user){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['geolocation'],geolocation:{latitude:26.3101,longitude:-80.2373},locale:'pt-BR'})
  await ctx.addInitScript(()=>{try{localStorage.setItem('eos-ficha-firstrun','1')}catch{}})
  const page=await ctx.newPage()
  await page.goto(`${B}/auth/login`,{waitUntil:'networkidle'})
  await page.fill('input[type="email"]',user.email); await page.fill('input[type="password"]',PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha/,{timeout:30000}).catch(()=>{})
  return page
}

const dono=await mkUser('Dono'), membro=await mkUser('Membro'), fora=await mkUser('Fora')
// dois círculos, para exercitar a seleção múltipla
const mk = async (name, members) => {
  const c=await admin('/rest/v1/circles',{method:'POST',body:JSON.stringify({name,leader_id:dono.id,invite_code:Math.random().toString(36).slice(2,8).toUpperCase().padEnd(6,"0").slice(0,6)})}).then(r=>r.json())
  if(!Array.isArray(c)||!c[0]){console.error('falha ao criar círculo:',JSON.stringify(c));process.exit(1)}
  await admin('/rest/v1/circle_members',{method:'POST',body:JSON.stringify(members.map(u=>({circle_id:c[0].id,user_id:u.id,role:u.id===dono.id?'Admin':'Editor',share_inventory:true,shared_fields:[]})))})
  return c[0].id
}
await mk('Casa', [dono, membro])
await mk('Vizinhança', [dono])
console.log('✅ 3 contas, 2 círculos')

const browser=await chromium.launch()
const p=await login(browser,dono)
await p.goto(`${B}/scenario`,{waitUntil:'networkidle'}); await p.waitForTimeout(5000)

const toggles = await p.locator('.sim-toggle').allTextContents()
const circleToggles = toggles.filter(t => /Casa|Vizinhança/.test(t))
console.log('círculos na tela:', circleToggles.length, '→', circleToggles.map(t=>t.trim()).join(' | '))

await p.locator('button:has-text("Iniciar simulação")').first().click()
await p.waitForTimeout(8000)
const link = await p.locator('.sim-link').innerText().catch(()=>null)
console.log('LINK DE CONVITE:', link ?? 'AUSENTE ❌')
await p.screenshot({path:'/tmp/eos-shots/29-link-convite.png'})

// membro do círculo recebe o pop-up
const m=await login(browser,membro)
await m.goto(`${B}/dashboard`,{waitUntil:'networkidle'}); await m.waitForTimeout(11000)
console.log('membro recebeu pop-up:', await m.locator('.sim-invite').count() ? 'sim ✅' : 'NÃO ❌')

// convidado de FORA entra pelo link
if (link) {
  const f=await login(browser,fora)
  const t0 = Date.now()
  await f.goto(link,{waitUntil:'networkidle'})
  await f.locator('.sim-invite').waitFor({ timeout: 25000 }).catch(()=>{})
  console.log('  tempo até o pop-up:', ((Date.now()-t0)/1000).toFixed(1) + 's')
  console.log('convidado foi para:', f.url().replace(B,''))
  const joinResp = await f.evaluate(async (t) => {
    const r = await fetch(`/api/simulation/join/${t}`, { method: 'POST' })
    return { status: r.status, body: await r.text() }
  }, link.split('/sim/')[1])
  console.log('  resposta do join:', joinResp.status, joinResp.body.slice(0,200))
  const rows = await admin(`/rest/v1/simulation_participants?user_id=eq.${fora.id}&select=session_id,status`).then(r=>r.json())
  console.log('  linhas do convidado no banco:', JSON.stringify(rows))
  const api = await f.evaluate(async () => { const r = await fetch('/api/simulation'); return await r.text() })
  console.log('  /api/simulation para o convidado:', api.slice(0,240))
  const inv = await f.locator('.sim-invite').count()
  console.log('CONVIDADO DE FORA RECEBEU O POP-UP:', inv ? 'sim ✅' : 'NÃO ❌')
  if (inv) {
    await f.locator('.sim-invite button.primary').click()
    await f.waitForTimeout(5000)
    console.log('convidado entrou na simulação:', await f.locator('.sim-banner').count() ? 'sim ✅' : 'NÃO ❌')
    await f.screenshot({path:'/tmp/eos-shots/30-convidado-dentro.png'})
  }
  // abrir o link de novo não pode resetar nada
  await f.goto(link,{waitUntil:'networkidle'}); await f.waitForTimeout(4000)
  console.log('reabrir o link manteve a simulação:', await f.locator('.sim-banner').count() ? 'sim ✅' : 'NÃO ❌')
}

await browser.close()
for (const u of [dono,membro,fora]) {
  await admin(`/auth/v1/admin/users/${u.id}`,{method:'DELETE'})
  await admin(`/rest/v1/profiles?id=eq.${u.id}`,{method:'DELETE'})
}
console.log('🧹 limpo')
