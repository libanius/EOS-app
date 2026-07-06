import { config } from 'dotenv'; config({ path: '.env.local' })
const BASE = process.argv[2] || 'https://eos-app-fawn.vercel.app'
const SU=process.env.NEXT_PUBLIC_SUPABASE_URL, SK=process.env.SUPABASE_SERVICE_ROLE_KEY, AK=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const REF=SU.match(/https:\/\/([^.]+)\./)[1]
const AH={apikey:SK,Authorization:`Bearer ${SK}`,'Content-Type':'application/json'}
console.log('BASE:', BASE)

let pass=0,fail=0; const chk=(n,ok,d='')=>{if(ok){pass++;console.log(`✅ ${n}`)}else{fail++;console.log(`❌ ${n} → ${d}`)}}
const created=[]
async function mkUser(name){
  const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-')
  const email=`mbr-${slug}-${Date.now()}@test.internal`
  const u=await(await fetch(`${SU}/auth/v1/admin/users`,{method:'POST',headers:AH,body:JSON.stringify({email,password:'Test#2026!',email_confirm:true,user_metadata:{full_name:name}})})).json()
  await fetch(`${SU}/rest/v1/profiles`,{method:'POST',headers:{...AH,Prefer:'return=representation'},body:JSON.stringify({id:u.id,name})})
  const s=await(await fetch(`${SU}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'Content-Type':'application/json',apikey:AK},body:JSON.stringify({email,password:'Test#2026!'})})).json()
  const cookie=`sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({access_token:s.access_token,token_type:'bearer',expires_in:s.expires_in,expires_at:s.expires_at,refresh_token:s.refresh_token,user:s.user}))}`
  created.push(u.id)
  const api=async(p,o={})=>{const r=await fetch(`${BASE}${p}`,{...o,headers:{'Content-Type':'application/json',Cookie:cookie,...o.headers}});let b;try{b=await r.json()}catch{b=null}return{status:r.status,body:b}}
  return {id:u.id, api}
}

const A = await mkUser('Admin Paulo')
const B = await mkUser('Requester Isadora')
const C = await mkUser('Buscador Joao')

// Admin cria círculo
const circleName = `Familia Teste ${Date.now()%100000}`
const cr = await A.api('/api/circles',{method:'POST',body:JSON.stringify({name:circleName})})
chk('Admin cria círculo', cr.status===201 && cr.body?.circle?.id, `${cr.status} ${JSON.stringify(cr.body).slice(0,120)}`)
const circleId = cr.body?.circle?.id
// pegar invite_code
const listA = await A.api('/api/circles')
const inviteCode = listA.body?.circles?.[0]?.invite_code
chk('círculo tem invite_code', !!inviteCode, JSON.stringify(inviteCode))

console.log('\n── FORMA 3: convite por CÓDIGO → pedido pendente ──')
const jb = await B.api('/api/circles/join',{method:'POST',body:JSON.stringify({inviteCode})})
chk('B entra por código → pending', jb.status===200 && jb.body?.status==='pending', `${jb.status} ${JSON.stringify(jb.body).slice(0,120)}`)
const myB = await B.api('/api/circles/my-requests')
chk('B vê seu pedido pendente', myB.body?.requests?.some(r=>r.circle_id===circleId && r.status==='pending'), JSON.stringify(myB.body).slice(0,120))
const reqsA = await A.api(`/api/circles/${circleId}/requests`)
const reqB = reqsA.body?.requests?.find(r=>r.requester_id===B.id)
chk('Admin lista pedido de B (com nome)', !!reqB && reqB.name==='Requester Isadora', JSON.stringify(reqsA.body).slice(0,150))

console.log('\n── autorização: não-admin não vê/decide ──')
// B ainda não é membro; tenta listar pedidos → 403
const forbidden = await B.api(`/api/circles/${circleId}/requests`)
chk('B (não-admin) não lista pedidos → 403', forbidden.status===403, `${forbidden.status}`)

console.log('\n── APROVAR ──')
const appr = await A.api(`/api/circles/${circleId}/requests/${reqB?.id}`,{method:'POST',body:JSON.stringify({action:'approve'})})
chk('Admin aprova', appr.status===200 && appr.body?.ok, `${appr.status} ${JSON.stringify(appr.body).slice(0,120)}`)
const listA2 = await A.api('/api/circles')
const membersA = listA2.body?.circles?.find(c=>c.id===circleId)?.members ?? []
chk('B agora é membro do círculo', membersA.some(m=>m.user_id===B.id), `membros=${membersA.map(m=>m.name).join(',')}`)
const listB = await B.api('/api/circles')
chk('B enxerga o círculo', listB.body?.circles?.some(c=>c.id===circleId), JSON.stringify(listB.body?.circles?.length))

console.log('\n── já-membro: entrar de novo → status member ──')
const again = await B.api('/api/circles/join',{method:'POST',body:JSON.stringify({inviteCode})})
chk('B já membro → status member', again.body?.status==='member', JSON.stringify(again.body).slice(0,100))
// B (Viewer) tenta aprovar algo → 403
const bApprove = await B.api(`/api/circles/${circleId}/requests/${reqB?.id}`,{method:'POST',body:JSON.stringify({action:'approve'})})
chk('B (Viewer) não decide → 403', bApprove.status===403, `${bApprove.status}`)

console.log('\n── FORMA 5: BUSCAR por nome + pedir sem código ──')
const search = await C.api(`/api/circles/search?q=${encodeURIComponent(circleName.slice(0,12))}`)
const found = search.body?.circles?.find(c=>c.id===circleId)
chk('C encontra círculo por nome', !!found, JSON.stringify(search.body).slice(0,150))
const reqC = await C.api(`/api/circles/${circleId}/requests`,{method:'POST',body:JSON.stringify({message:'Sou o João'})})
chk('C pede para entrar (sem código) → pending', reqC.body?.status==='pending', JSON.stringify(reqC.body).slice(0,100))
const reqsA2 = await A.api(`/api/circles/${circleId}/requests`)
const reqCrow = reqsA2.body?.requests?.find(r=>r.requester_id===C.id)
chk('Admin vê pedido de C', !!reqCrow, JSON.stringify(reqsA2.body?.requests?.length))

console.log('\n── REJEITAR + re-pedir ──')
const rej = await A.api(`/api/circles/${circleId}/requests/${reqCrow?.id}`,{method:'POST',body:JSON.stringify({action:'reject'})})
chk('Admin rejeita C', rej.status===200, `${rej.status}`)
const listC = await C.api('/api/circles')
chk('C NÃO é membro após rejeição', !listC.body?.circles?.some(c=>c.id===circleId), JSON.stringify(listC.body?.circles?.length))
const reReq = await C.api(`/api/circles/${circleId}/requests`,{method:'POST',body:JSON.stringify({})})
chk('C consegue re-pedir após rejeição', reReq.body?.status==='pending', JSON.stringify(reReq.body).slice(0,100))

console.log('\n── FORMA 1 e 2: membro manual (+ base do scan de ficha) ──')
const fam = await A.api('/api/family-members',{method:'POST',body:JSON.stringify({name:'Filho Manual',age:8})})
chk('add membro manual (forma 1)', fam.status===200||fam.status===201, `${fam.status}`)
// scan de ficha (forma 2/6): leitura pública da ficha de B para pré-preencher
const pub = await A.api('/api/profile/ficha',{method:'POST',body:JSON.stringify({id:B.id})})
chk('ler ficha pública p/ pré-preencher (forma 2/6)', pub.status===200 && pub.body?.ficha?.name, `${pub.status} ${JSON.stringify(pub.body).slice(0,100)}`)

// cleanup
for(const id of created){
  await fetch(`${SU}/rest/v1/circle_join_requests?requester_id=eq.${id}`,{method:'DELETE',headers:AH})
  await fetch(`${SU}/rest/v1/circle_members?user_id=eq.${id}`,{method:'DELETE',headers:AH})
}
if(circleId){await fetch(`${SU}/rest/v1/circles?id=eq.${circleId}`,{method:'DELETE',headers:AH})}
for(const id of created){
  await fetch(`${SU}/rest/v1/family_members?profile_id=eq.${id}`,{method:'DELETE',headers:AH})
  await fetch(`${SU}/rest/v1/profiles?id=eq.${id}`,{method:'DELETE',headers:AH})
  await fetch(`${SU}/auth/v1/admin/users/${id}`,{method:'DELETE',headers:AH})
}
console.log(`\n══ ${pass} ✅  ${fail} ❌ ══`)
process.exit(fail>0?1:0)
