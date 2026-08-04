/**
 * Dois planos no mesmo círculo não podem se sobrescrever (D-080).
 *
 * A migration removeu o índice de plano-ativo-único. O PUT antigo pegava "o mais
 * recente" e sobrescrevia — com dois planos, salvar um destruiria o outro em
 * silêncio. Perder o plano que a família combinou é a pior falha possível aqui.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { track, cleanupOnExit } from './lib/test-cleanup.mjs'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
const URL=process.env.NEXT_PUBLIC_SUPABASE_URL, KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT=3022, B=`http://localhost:${PORT}`, PASS='EosTest#2026!'
const admin=(p,o={})=>fetch(`${URL}${p}`,{...o,headers:{'Content-Type':'application/json',apikey:KEY,Authorization:`Bearer ${KEY}`,Prefer:'return=representation',...o.headers}})
let pass=0, fail=0
const ok=(l,d='')=>{pass++;console.log(`✅ ${l}${d?': '+d:''}`)}
const no=(l,d='')=>{fail++;console.log(`❌ ${l}${d?': '+d:''}`)}
const server=spawn('npx',['next','start','-p',String(PORT)],{env:process.env,stdio:'ignore'})
process.on('exit',()=>{try{server.kill('SIGTERM')}catch{}})
for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,500));if(await fetch(`${B}/plan`).then(r=>r.status<500).catch(()=>false))break}

const email=`eos-mp-${Date.now()}@test.internal`
const u=await admin('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password:PASS,email_confirm:true})}).then(r=>r.json())
await admin(`/rest/v1/profiles?id=eq.${u.id}`,{method:'PATCH',body:JSON.stringify({name:'MP'})})
const circle=await admin('/rest/v1/circles',{method:'POST',body:JSON.stringify({name:'Multi',leader_id:u.id,invite_code:'MP'+Math.random().toString(36).slice(2,6).toUpperCase()})}).then(r=>r.json())
await admin('/rest/v1/circle_members',{method:'POST',body:JSON.stringify([{circle_id:circle[0].id,user_id:u.id,role:'Admin',share_inventory:true,shared_fields:[]}])})

const browser=await chromium.launch({args:['--no-sandbox']})
const ctx=await browser.newContext({locale:'pt-BR'})
const page=await ctx.newPage()
await page.goto(`${B}/auth/login`,{waitUntil:'networkidle'})
await page.fill('input[type="email"]',email); await page.fill('input[type="password"]',PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding/,{timeout:30000}).catch(()=>{})

const put=(body)=>page.evaluate(async b=>{
  const r=await fetch('/api/plans',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})
  return {status:r.status, body:await r.json().catch(()=>null)}
}, body)

const wp=(name)=>[{kind:'rendezvous_1',name,lat:26.31,lng:-80.24}]
const role=[{member_user_id:u.id,responsibility:'busca a filha'}]

// Dois planos, criados sem planId — cada um deve NASCER, não sobrescrever.
// O primeiro plano do círculo pode ser criado sem cerimônia; o segundo é
// explicitamente NOVO, senão o servidor teria de adivinhar.
const a=await put({circleId:circle[0].id,name:'Queda de energia',waypoints:wp('Portão'),roles:role,status:'active'})
const b=await put({circleId:circle[0].id,createNew:true,name:'Sem sinal',waypoints:wp('Praça'),roles:role,status:'active'})
const criados=await admin(`/rest/v1/family_plans?circle_id=eq.${circle[0].id}&select=id,name`).then(r=>r.json())
a.body?.planId && b.body?.planId && a.body.planId !== b.body.planId && criados.length===2
  ? ok('dois planos coexistem no mesmo círculo', criados.map(p=>p.name).join(' · '))
  : no('criação de planos falhou', `${JSON.stringify(a.body)} ${JSON.stringify(b.body)} banco=${criados.length}`)

// Atualizar o primeiro NÃO pode tocar no segundo.
await put({circleId:circle[0].id,planId:a.body.planId,name:'Queda de energia',waypoints:wp('Portão novo'),roles:role,status:'active'})
const pontosB=await admin(`/rest/v1/family_plan_waypoints?plan_id=eq.${b.body.planId}&select=name`).then(r=>r.json())
const pontosA=await admin(`/rest/v1/family_plan_waypoints?plan_id=eq.${a.body.planId}&select=name`).then(r=>r.json())
pontosA?.[0]?.name==='Portão novo' && pontosB?.[0]?.name==='Praça'
  ? ok('salvar um plano não tocou no outro', `A="${pontosA[0].name}" B="${pontosB[0].name}"`)
  : no('um plano sobrescreveu o outro', `A=${JSON.stringify(pontosA)} B=${JSON.stringify(pontosB)}`)

// Plano de outro círculo não é editável mesmo com id válido.
const outro=await admin('/rest/v1/circles',{method:'POST',body:JSON.stringify({name:'Outro',leader_id:u.id,invite_code:'OT'+Math.random().toString(36).slice(2,6).toUpperCase()})}).then(r=>r.json())
await admin('/rest/v1/circle_members',{method:'POST',body:JSON.stringify([{circle_id:outro[0].id,user_id:u.id,role:'Admin',share_inventory:true,shared_fields:[]}])})
const cruzado=await put({circleId:outro[0].id,planId:a.body.planId,waypoints:wp('X'),roles:role,status:'active'})
cruzado.status===403
  ? ok('plano de outro círculo é recusado', 'HTTP 403')
  : no('escrita cruzada entre círculos aceita', `HTTP ${cruzado.status}`)

// E com dois planos, salvar sem dizer qual precisa RECUSAR, não adivinhar.
const ambiguo=await put({circleId:circle[0].id,waypoints:wp('Y'),roles:role,status:'active'})
ambiguo.status===409
  ? ok('salvar sem dizer qual plano é recusado', 'HTTP 409 ambiguous_plan')
  : no('adivinhou qual plano sobrescrever', `HTTP ${ambiguo.status}`)

await browser.close(); server.kill('SIGTERM')
await admin(`/auth/v1/admin/users/${u.id}`,{method:'DELETE'}); await admin(`/rest/v1/profiles?id=eq.${u.id}`,{method:'DELETE'})
for (const c of [circle[0].id, outro[0].id]) await admin(`/rest/v1/circles?id=eq.${c}`,{method:'DELETE'})
console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail?1:0)
