/**
 * Plano de voo da família (PLAN-T01): salvar, versionar, reconhecer.
 *
 * ATENÇÃO: cria e apaga contas no Supabase de PRODUÇÃO — é o único projeto
 * configurado no .env.local.
 */
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })
const URL=process.env.NEXT_PUBLIC_SUPABASE_URL, KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
const B='http://localhost:3000', PASS='EosTest#2026!'
const admin=(p,o={})=>fetch(`${URL}${p}`,{...o,headers:{'Content-Type':'application/json',apikey:KEY,Authorization:`Bearer ${KEY}`,Prefer:'return=representation',...o.headers}})

async function mkUser(name){
  const email=`eos-plan-${name.toLowerCase()}-${Date.now()}@test.internal`
  const u=await admin('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password:PASS,email_confirm:true})}).then(r=>r.json())
  await admin(`/rest/v1/profiles?id=eq.${u.id}`,{method:'PATCH',body:JSON.stringify({name,location_lat:26.3101,location_lng:-80.2373})})
  return {id:u.id,email,name}
}
async function login(browser,user){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'pt-BR'})
  await ctx.addInitScript(()=>{try{localStorage.setItem('eos-ficha-firstrun','1')}catch{}})
  const page=await ctx.newPage()
  await page.goto(`${B}/auth/login`,{waitUntil:'networkidle'})
  await page.fill('input[type="email"]',user.email); await page.fill('input[type="password"]',PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha/,{timeout:30000}).catch(()=>{})
  return page
}

const autor=await mkUser('Autor'), membro=await mkUser('Membro')
const c=await admin('/rest/v1/circles',{method:'POST',body:JSON.stringify({name:'Plano Teste',leader_id:autor.id,invite_code:Math.random().toString(36).slice(2,8).toUpperCase().padEnd(6,'0').slice(0,6)})}).then(r=>r.json())
const cid=c[0].id
await admin('/rest/v1/circle_members',{method:'POST',body:JSON.stringify([
  {circle_id:cid,user_id:autor.id,role:'Admin',share_inventory:true,shared_fields:[]},
  {circle_id:cid,user_id:membro.id,role:'Editor',share_inventory:true,shared_fields:[]},
])})
console.log('✅ círculo com autor e membro')

const browser=await chromium.launch()
const a=await login(browser,autor)
const api=(page,path,opts)=>page.evaluate(async ([p,o])=>{const r=await fetch(p,o);return {status:r.status, body:await r.json()}},[path,opts])

// plano vazio
let g=await api(a,'/api/plans?circleId='+cid,{})
console.log('plano antes de existir:', JSON.stringify(g.body))

// salva v1
const plan1={circleId:cid,name:'Plano Libanio',status:'active',
  waypoints:[
    {kind:'rendezvous_1',name:'Frente de casa',lat:26.3101,lng:-80.2373},
    {kind:'rendezvous_3',name:'Casa da tia em Orlando',lat:28.5383,lng:-81.3792},
    {kind:'school',name:'Escola da Isadora',lat:26.3150,lng:-80.2400},
  ],
  routes:[{label:'Casa → Escola',mode:'car',geometry:{type:'LineString',coordinates:[[-80.2373,26.3101],[-80.2400,26.3150]]}}],
  roles:[{member_user_id:membro.id,responsibility:'Buscar a Isadora na escola'}]}
let put=await api(a,'/api/plans',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(plan1)})
console.log('salvou v1:', put.status, JSON.stringify(put.body))

g=await api(a,'/api/plans?circleId='+cid,{})
console.log('lido:', 'v'+g.body.plan.version, '|', g.body.waypoints.length,'pontos,',g.body.routes.length,'rota,',g.body.roles.length,'papel')
console.log('  reconhecido por (autor incluso):', g.body.acknowledgedBy.length)

// o membro vê e reconhece
const m=await login(browser,membro)
let gm=await api(m,'/api/plans?circleId='+cid,{})
console.log('membro vê o plano:', gm.body.plan ? 'sim ✅' : 'NÃO ❌', '| meu ack:', gm.body.myAck)
let ack=await api(m,`/api/plans/${g.body.plan.id}/ack`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:g.body.plan.version})})
console.log('membro reconheceu v1:', JSON.stringify(ack.body))

// autor salva v2 → o ack do membro fica para trás
let put2=await api(a,'/api/plans',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...plan1,waypoints:[...plan1.waypoints,{kind:'rendezvous_2',name:'Praça do bairro',lat:26.3120,lng:-80.2390}]})})
console.log('salvou v2:', JSON.stringify(put2.body))
g=await api(a,'/api/plans?circleId='+cid,{})
console.log('v2 →', g.body.waypoints.length, 'pontos | reconheceram v2:', g.body.acknowledgedBy.length, '(só o autor = correto)')

// tentar reconhecer versão velha
let stale=await api(m,`/api/plans/${g.body.plan.id}/ack`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1})})
console.log('reconhecer v1 antiga:', JSON.stringify(stale.body), stale.body.error==='stale' ? '✅ recusado' : '❌')

await browser.close()
for (const u of [autor,membro]) { await admin(`/auth/v1/admin/users/${u.id}`,{method:'DELETE'}); await admin(`/rest/v1/profiles?id=eq.${u.id}`,{method:'DELETE'}) }
console.log('🧹 limpo')
