/**
 * EOS E2E Test Agent — testa o app como um usuário real
 *
 * Uso:
 *   node scripts/e2e-agent.mjs                              (localhost:3000)
 *   node scripts/e2e-agent.mjs --url https://eos-app-fawn.vercel.app
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

const BASE_URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:3000'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PROJECT_REF  = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1] ?? ''

const TEST_EMAIL = `eos-agent-${Date.now()}@test.internal`
const TEST_PASS  = 'EosTest#2026!'

let passed = 0, failed = 0
function ok(l, d='')   { passed++; console.log(`✅ ${l}${d?': '+d:''}`) }
function fail(l, d='') { failed++; console.log(`❌ ${l}${d?': '+d:''}`) }
function info(l, d='') { console.log(`ℹ️  ${l}${d?': '+d:''}`) }

// Admin fetch (service role, bypassa RLS)
async function adminFetch(path, opts={}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type':'application/json', apikey:SERVICE_KEY,
      Authorization:`Bearer ${SERVICE_KEY}`, Prefer:'return=representation', ...opts.headers },
  })
  let body; try { body = await res.json() } catch { body={} }
  return { status:res.status, body }
}

// ─── 1. Criar usuário de teste ─────────────────────────────────────────────
info('URL', BASE_URL)
info('Criando usuário de teste', TEST_EMAIL)

const { status:cs, body:cb } = await adminFetch('/auth/v1/admin/users', {
  method:'POST',
  body:JSON.stringify({ email:TEST_EMAIL, password:TEST_PASS, email_confirm:true }),
})
if (cs !== 200 && cs !== 201) { fail('Criar usuário', `${cs} ${JSON.stringify(cb).slice(0,100)}`); process.exit(1) }
const USER_ID = cb.id
ok('Usuário criado', `id=${USER_ID.slice(0,8)}...`)

// Profile (coluna 'name')
const { status:ps } = await adminFetch('/rest/v1/profiles', {
  method:'POST', body:JSON.stringify({ id:USER_ID, name:'EOS Test Agent' }),
})
ps >= 400 ? fail('Criar profile', `status ${ps}`) : ok('Profile criado')

// Família de teste
const { status:fs } = await adminFetch('/rest/v1/family_members', {
  method:'POST',
  body:JSON.stringify([
    { profile_id:USER_ID, name:'Adulto',  age:35 },
    { profile_id:USER_ID, name:'Criança', age:8  },
    { profile_id:USER_ID, name:'Idoso',   age:72 },
  ]),
})
fs >= 400 ? fail('Criar família') : ok('Família criada', '3 membros')

// ─── 2. Login ──────────────────────────────────────────────────────────────
const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method:'POST',
  headers:{ 'Content-Type':'application/json', apikey:ANON_KEY },
  body:JSON.stringify({ email:TEST_EMAIL, password:TEST_PASS }),
})
const sess = await loginRes.json()
if (!sess.access_token) { fail('Login', JSON.stringify(sess).slice(0,100)); process.exit(1) }
ok('Login', 'token obtido')

const cookieVal = encodeURIComponent(JSON.stringify({
  access_token:sess.access_token, token_type:'bearer',
  expires_in:sess.expires_in, expires_at:sess.expires_at,
  refresh_token:sess.refresh_token, user:sess.user,
}))
const COOKIE = `sb-${PROJECT_REF}-auth-token=${cookieVal}`

async function appFetch(path, opts={}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers:{ 'Content-Type':'application/json', Cookie:COOKIE, ...opts.headers },
  })
  let body; try { body = await res.json() } catch { body=null }
  return { status:res.status, body }
}

// ─── 3. Testes de API ──────────────────────────────────────────────────────
console.log('\n── Testes de API ──────────────────────────────────────────────')

// Profile via POST (a API só tem POST para upsert — GET retorna 405)
{
  const { status, body } = await appFetch('/api/profile', {
    method:'POST', body:JSON.stringify({ name:'EOS Test Agent', location:null }),
  })
  if (status === 200) ok('POST /api/profile (upsert)', `name=${body?.profile?.name ?? body?.name}`)
  else fail('POST /api/profile', `${status} ${JSON.stringify(body).slice(0,80)}`)
}

// Family members — retorna { members: [] }
{
  const { status, body } = await appFetch('/api/family-members')
  if (status === 200 && Array.isArray(body?.members)) ok('GET /api/family-members', `${body.members.length} membros`)
  else fail('GET /api/family-members', `${status} ${JSON.stringify(body).slice(0,80)}`)
}

// Inventory — requer coluna updated_at
{
  const { status, body } = await appFetch('/api/inventory')
  if (status === 200) ok('GET /api/inventory', 'OK')
  else fail('GET /api/inventory', `${status} ${body?.error ?? ''}`)
}

// Checklist vazio
{
  const { status, body } = await appFetch('/api/checklist')
  if (status === 200 && Array.isArray(body?.items)) ok('GET /api/checklist', `${body.items.length} items`)
  else fail('GET /api/checklist', `${status} ${JSON.stringify(body).slice(0,80)}`)
}

// Gerar checklist com Claude Haiku
{
  info('Gerando checklist GENERAL via Claude Haiku...')
  const { status, body } = await appFetch('/api/checklist/generate', {
    method:'POST', body:JSON.stringify({ scenarioType:'GENERAL' }),
  })
  if (status === 200 && body?.items?.length > 0) {
    ok('POST /api/checklist/generate', `${body.items.length} items`)
    ok('  Tiers', [...new Set(body.items.map(i=>i.tier))].join(', '))
    ok('  Exemplo', `"${body.items[0].item_name}" qty=${body.items[0].quantity} ${body.items[0].unit ?? ''}`)
  } else {
    fail('POST /api/checklist/generate', `${status} ${body?.error ?? JSON.stringify(body).slice(0,100)}`)
  }
}

// Circles — requer RLS sem recursão
{
  const { status, body } = await appFetch('/api/circles')
  if (status === 200) ok('GET /api/circles', 'OK')
  else fail('GET /api/circles', `${status} ${body?.error ?? ''}`)
}

// Decision Engine — payload correto: scenario + scenarioType
{
  info('Testando Decision Engine (streaming)...')
  const res = await fetch(`${BASE_URL}/api/analyze`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Cookie:COOKIE },
    body:JSON.stringify({ scenario:'Rio próximo transbordando', scenarioType:'FLOOD' }),
  })
  if (res.status === 200) {
    const reader = res.body.getReader()
    const { value } = await reader.read()
    reader.cancel()
    const snippet = new TextDecoder().decode(value).slice(0,60)
    ok('POST /api/analyze', `streaming: ${snippet}`)
  } else {
    const b = await res.json().catch(()=>({}))
    fail('POST /api/analyze', `${res.status} ${b?.error ?? ''}`)
  }
}

// ─── 4. Cleanup ────────────────────────────────────────────────────────────
console.log('\n── Cleanup ────────────────────────────────────────────────────')
const { status:ds } = await adminFetch(`/auth/v1/admin/users/${USER_ID}`, { method:'DELETE' })
;(ds === 200 || ds === 204) ? ok('Usuário removido') : fail('Remover usuário', `status ${ds}`)

// ─── Relatório ─────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════')
console.log(`  RESULTADO: ${passed} ✅ PASSOU    ${failed} ❌ FALHOU`)
console.log('══════════════════════════════════════════════════════════════')
if (failed > 0) process.exit(1)
