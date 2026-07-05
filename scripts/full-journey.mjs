/**
 * EOS — Full user journey test (real user simulation)
 * Testa onboarding → ficha master → família → inventário → checklist → tabelas → círculos → weather → analyze
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

const BASE = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url')+1] : 'https://eos-app-fawn.vercel.app'
const SU = process.env.NEXT_PUBLIC_SUPABASE_URL
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const AK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const REF = SU.match(/https:\/\/([^.]+)\./)[1]

let pass=0, fail=0
const P=(l,d='')=>{pass++;console.log(`✅ ${l}${d?': '+d:''}`)}
const F=(l,d='')=>{fail++;console.log(`❌ ${l}${d?': '+d:''}`)}
const I=(l,d='')=>console.log(`ℹ️  ${l}${d?': '+d:''}`)

const adm=(p,o={})=>fetch(`${SU}${p}`,{...o,headers:{'Content-Type':'application/json',apikey:SK,Authorization:`Bearer ${SK}`,Prefer:'return=representation',...o.headers}})

const EMAIL=`journey-${Date.now()}@test.internal`
const PASS='EosTest#2026!'
I('BASE',BASE); I('user',EMAIL)

const cu=await adm('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email:EMAIL,password:PASS,email_confirm:true})})
const cub=await cu.json()
if(!cub.id){F('criar usuário',JSON.stringify(cub).slice(0,120));process.exit(1)}
const UID=cub.id
P('usuário criado',UID.slice(0,8))

const lr=await fetch(`${SU}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'Content-Type':'application/json',apikey:AK},body:JSON.stringify({email:EMAIL,password:PASS})})
const s=await lr.json()
if(!s.access_token){F('login',JSON.stringify(s).slice(0,120));process.exit(1)}
P('login')
const COOKIE=`sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({access_token:s.access_token,token_type:'bearer',expires_in:s.expires_in,expires_at:s.expires_at,refresh_token:s.refresh_token,user:s.user}))}`
const H={'Content-Type':'application/json',Cookie:COOKIE}
const app=async(p,o={})=>{const r=await fetch(`${BASE}${p}`,{...o,headers:{...H,...o.headers}});let b;try{b=await r.json()}catch{b=null}return{status:r.status,body:b}}

const cleanup=async()=>{await fetch(`${SU}/auth/v1/admin/users/${UID}`,{method:'DELETE',headers:{apikey:SK,Authorization:`Bearer ${SK}`}})}

console.log('\n── 1. ONBOARDING (POST /api/profile) ──')
{
  const {status,body}=await app('/api/profile',{method:'POST',body:JSON.stringify({name:'Maria Journey',location:'São Paulo, SP'})})
  status===200?P('onboarding profile',`name=${body?.profile?.name}`):F('onboarding profile',`${status} ${JSON.stringify(body).slice(0,120)}`)
}

console.log('\n── 2. FICHA MASTER (GET + PATCH /api/profile/ficha) ──')
{
  const {status,body}=await app('/api/profile/ficha')
  status===200&&body?.ficha?P('GET ficha inicial',`name=${body.ficha.name}`):F('GET ficha inicial',`${status} ${JSON.stringify(body).slice(0,150)}`)
}
// PATCH cada campo — simula preenchimento progressivo da ficha
const fichaPatches=[
  {label:'nome',patch:{name:'Maria Journey Silva'}},
  {label:'localização',patch:{location:'Rio de Janeiro, RJ'}},
  {label:'tipo sanguíneo',patch:{blood_type:'O+'}},
  {label:'alergias',patch:{allergies:['Penicilina','Amendoim']}},
  {label:'contato emergência nome',patch:{emergency_contact_name:'João Silva'}},
  {label:'contato emergência tel',patch:{emergency_contact_phone:'+55 21 99999-8888'}},
  {label:'notas médicas',patch:{medical_notes:'Hipertensão controlada'}},
  {label:'medicamentos',patch:{medications:['Losartana 50mg','AAS 100mg']}},
  {label:'ficha completa (multi-campo)',patch:{name:'Maria J. Silva',blood_type:'A-',allergies:['Dipirona'],medications:['Ibuprofeno']}},
]
for(const {label,patch} of fichaPatches){
  const {status,body}=await app('/api/profile/ficha',{method:'PATCH',body:JSON.stringify(patch)})
  status===200&&body?.ficha?P(`PATCH ficha ${label}`):F(`PATCH ficha ${label}`,`${status} ${JSON.stringify(body).slice(0,180)}`)
}
// Erros esperados
{
  const {status}=await app('/api/profile/ficha',{method:'PATCH',body:JSON.stringify({name:'   '})})
  status===400?P('PATCH ficha nome vazio → 400'):F('PATCH ficha nome vazio',`esperava 400, veio ${status}`)
}
// Ficha pública
{
  const {status,body}=await app('/api/profile/ficha',{method:'POST',body:JSON.stringify({id:UID})})
  status===200&&body?.ficha?P('POST ficha pública (socorrista)'):F('POST ficha pública',`${status} ${JSON.stringify(body).slice(0,120)}`)
}

console.log('\n── 3. FAMÍLIA (POST/GET/PATCH/DELETE /api/family-members) ──')
let memberId=null
{
  const {status,body}=await app('/api/family-members',{method:'POST',body:JSON.stringify({name:'Pedro',age:8,medical_conditions:['Asma'],mobility_impaired:false,is_infant:false})})
  if(status===200||status===201){memberId=body?.member?.id||body?.id;P('POST family-member',`id=${String(memberId).slice(0,8)}`)}
  else F('POST family-member',`${status} ${JSON.stringify(body).slice(0,150)}`)
}
{
  const {status,body}=await app('/api/family-members')
  status===200&&Array.isArray(body?.members)?P('GET family-members',`${body.members.length}`):F('GET family-members',`${status} ${JSON.stringify(body).slice(0,120)}`)
}
if(memberId){
  const {status,body}=await app(`/api/family-members/${memberId}`,{method:'PATCH',body:JSON.stringify({age:9})})
  status===200?P('PATCH family-member'):F('PATCH family-member',`${status} ${JSON.stringify(body).slice(0,150)}`)
}
{
  const {status,body}=await app('/api/family-members/suggest-tags',{method:'POST',body:JSON.stringify({name:'Vovó Ana',age:78})})
  status===200?P('POST suggest-tags',JSON.stringify(body).slice(0,80)):F('POST suggest-tags',`${status} ${JSON.stringify(body).slice(0,150)}`)
}

console.log('\n── 4. INVENTÁRIO (GET/POST /api/inventory) ──')
{
  const {status,body}=await app('/api/inventory',{method:'POST',body:JSON.stringify({water_liters:45,food_days:7,fuel_liters:5,battery_percent:80,has_medical_kit:true,has_communication_device:true,cash_amount:200})})
  status===200?P('POST inventory'):F('POST inventory',`${status} ${JSON.stringify(body).slice(0,180)}`)
}
{
  const {status,body}=await app('/api/inventory')
  status===200?P('GET inventory',`water=${body?.inventory?.water_liters??body?.water_liters}`):F('GET inventory',`${status} ${JSON.stringify(body).slice(0,120)}`)
}

console.log('\n── 5. CHECKLIST / TABELAS (generate/toggle/save) ──')
let checklistItems=[]
{
  const {status,body}=await app('/api/checklist/generate',{method:'POST',body:JSON.stringify({scenarioType:'GENERAL'})})
  if(status===200&&(body?.count>0||body?.items?.length>0)){P('POST checklist/generate',`count=${body.count??body.items?.length}`)}
  else F('POST checklist/generate',`${status} ${JSON.stringify(body).slice(0,180)}`)
}
{
  const {status,body}=await app('/api/checklist')
  if(status===200&&Array.isArray(body?.items)){checklistItems=body.items;P('GET checklist',`${body.items.length} itens; tiers=${[...new Set(body.items.map(i=>i.tier))].join(',')}`)}
  else F('GET checklist',`${status} ${JSON.stringify(body).slice(0,120)}`)
}
if(checklistItems.length){
  const it=checklistItems.find(i=>i.canonical_key)||checklistItems[0]
  const {status,body}=await app('/api/checklist/toggle',{method:'POST',body:JSON.stringify({canonicalKey:it.canonical_key,acquired:true})})
  status===200?P('POST checklist/toggle',`updated=${body?.updated}`):F('POST checklist/toggle',`${status} ${JSON.stringify(body).slice(0,150)}`)
}

console.log('\n── 6. CÍRCULOS (GET/POST /api/circles + join) ──')
let circleId=null,inviteCode=null
{
  const {status,body}=await app('/api/circles',{method:'POST',body:JSON.stringify({name:'Família Journey'})})
  if(status===200||status===201){circleId=body?.circle?.id||body?.id;inviteCode=body?.circle?.invite_code||body?.invite_code;P('POST circles',`id=${String(circleId).slice(0,8)} code=${inviteCode}`)}
  else F('POST circles',`${status} ${JSON.stringify(body).slice(0,180)}`)
}
{
  const {status,body}=await app('/api/circles')
  status===200?P('GET circles',`${Array.isArray(body?.circles)?body.circles.length:'?'}`):F('GET circles',`${status} ${JSON.stringify(body).slice(0,120)}`)
}

console.log('\n── 7. WEATHER INTELLIGENCE (GET lat/lng) ──')
{
  const {status,body}=await app('/api/weather-intelligence?lat=-22.9&lng=-43.2')
  status===200?P('GET weather-intelligence',`providers=${JSON.stringify(body?.providers)}`):F('GET weather-intelligence',`${status} ${JSON.stringify(body).slice(0,180)}`)
}

console.log('\n── 8. AI READINESS (GET) ──')
{
  const {status,body}=await app('/api/ai/readiness')
  status===200?P('GET ai/readiness',`risk=${body?.briefing?.risk_level}`):F('GET ai/readiness',`${status} ${JSON.stringify(body).slice(0,180)}`)
}

console.log('\n── 9. DECISION ENGINE (streaming /api/analyze) ──')
{
  const r=await fetch(`${BASE}/api/analyze`,{method:'POST',headers:H,body:JSON.stringify({scenario:'Enchente próxima ao rio',scenarioType:'FLOOD'})})
  if(r.status===200){const rd=r.body.getReader();const{value}=await rd.read();rd.cancel();P('POST analyze',new TextDecoder().decode(value).slice(0,50).replace(/\n/g,' '))}
  else{const b=await r.json().catch(()=>({}));F('POST analyze',`${r.status} ${b?.error??''}`)}
}

console.log('\n── 10. MONITOR + PLAN ──')
{
  const {status,body}=await app('/api/monitor?lat=-22.9&lng=-43.2')
  status===200?P('GET monitor'):F('GET monitor',`${status} ${JSON.stringify(body).slice(0,120)}`)
}
{
  const {status,body}=await app('/api/profile/plan')
  status===200?P('GET profile/plan',`plan=${body?.plan}`):F('GET profile/plan',`${status} ${JSON.stringify(body).slice(0,120)}`)
}

await cleanup()
console.log('\n══════════════════════════════════════════')
console.log(`  RESULTADO: ${pass} ✅   ${fail} ❌`)
console.log('══════════════════════════════════════════')
process.exit(fail>0?1:0)
