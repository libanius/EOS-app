/**
 * Controle do círculo, com navegador de verdade (D-077).
 *
 * Existe por causa de um bug que só aparece se você conferir o BANCO depois:
 * mudar o papel de um membro respondia `{"ok":true}` e não mudava nada. A RLS
 * de `circle_members` bloqueia o UPDATE numa linha de outra pessoa, e um UPDATE
 * bloqueado por RLS **não devolve erro** — afeta zero linhas e o Supabase
 * responde sucesso. O dono trocava para Editor e "nada acontecia".
 *
 * Por isso toda asserção aqui lê o estado real depois da ação. Conferir só o
 * código HTTP teria dado tudo verde com o produto quebrado.
 *
 * ATENÇÃO: cria e apaga contas no Supabase de produção.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3015)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'

const admin = (p, o = {}) => fetch(`${URL}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

let pass = 0, fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

if (!fs.existsSync('.next/BUILD_ID')) { console.error('Faltou `npm run build`.'); process.exit(1) }
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: process.env, stdio: 'ignore' })
const stopServer = () => { try { server.kill('SIGTERM') } catch {} }
process.on('exit', stopServer)
let up = false
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise(r => setTimeout(r, 500))
  up = await fetch(`${B}/circles`).then(r => r.status < 500).catch(() => false)
}
if (!up) { console.error('Servidor não subiu'); stopServer(); process.exit(1) }

async function mkUser(name) {
  const email = `eos-adm-${name}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
  return { id: u.id, email, name }
}

async function login(browser, user) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'pt-BR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
  const page = await ctx.newPage()
  await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', user.email)
  await page.fill('input[type="password"]', PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha|onboarding/, { timeout: 30000 }).catch(() => {})
  return page
}

const dono = await mkUser('Dono')
const membro = await mkUser('Membro')
const intruso = await mkUser('Intruso')
const circle = await admin('/rest/v1/circles', { method: 'POST', body: JSON.stringify({
  name: 'Círculo Admin', leader_id: dono.id,
  invite_code: Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6),
}) }).then(r => r.json())
const circleId = circle[0].id
await admin('/rest/v1/circle_members', { method: 'POST', body: JSON.stringify([
  { circle_id: circleId, user_id: dono.id, role: 'Admin', share_inventory: true, shared_fields: [] },
  { circle_id: circleId, user_id: membro.id, role: 'Viewer', share_inventory: true, shared_fields: [] },
]) })
console.log('— círculo com Admin e Viewer\n')

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await login(browser, dono)
const call = (path, method, body) =>
  page.evaluate(async ({ path, method, body }) => {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }, { path, method, body })

// ── 1. promover a Editor tem que MUDAR O BANCO ──────────────────────────────
const promote = await call(`/api/circles/${circleId}/members/${membro.id}`, 'PATCH', { role: 'Editor' })
const roleRow = await admin(`/rest/v1/circle_members?circle_id=eq.${circleId}&user_id=eq.${membro.id}&select=role`).then(r => r.json())
promote.body?.ok && roleRow?.[0]?.role === 'Editor'
  ? ok('promover a Editor mudou o papel no banco', `HTTP ${promote.status}`)
  : no('papel não mudou', `resposta=${JSON.stringify(promote)} banco=${JSON.stringify(roleRow)}`)

// ── 2. quem não é Admin não muda papel de ninguém ───────────────────────────
const outra = await login(browser, intruso)
const nao = await outra.evaluate(async ({ cid, uid }) => {
  const res = await fetch(`/api/circles/${cid}/members/${uid}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'Admin' }),
  })
  return { status: res.status }
}, { cid: circleId, uid: membro.id })
const aindaEditor = await admin(`/rest/v1/circle_members?circle_id=eq.${circleId}&user_id=eq.${membro.id}&select=role`).then(r => r.json())
nao.status === 403 && aindaEditor?.[0]?.role === 'Editor'
  ? ok('quem não é do círculo recebe 403 e nada muda')
  : no('autorização furada', `status=${nao.status} papel=${JSON.stringify(aindaEditor)}`)

// ── 3. renomear o círculo ───────────────────────────────────────────────────
const rename = await call(`/api/circles/${circleId}`, 'PATCH', { name: 'Família Libânio' })
const named = await admin(`/rest/v1/circles?id=eq.${circleId}&select=name`).then(r => r.json())
rename.body?.ok && named?.[0]?.name === 'Família Libânio'
  ? ok('círculo renomeado', named[0].name)
  : no('renomear falhou', `${JSON.stringify(rename)} ${JSON.stringify(named)}`)

// ── 4. excluir exige o nome exato ───────────────────────────────────────────
const semNome = await call(`/api/circles/${circleId}`, 'DELETE', { confirmName: 'nome errado' })
const sobreviveu = await admin(`/rest/v1/circles?id=eq.${circleId}&select=id`).then(r => r.json())
semNome.status === 400 && sobreviveu?.length === 1
  ? ok('exclusão sem o nome exato é recusada')
  : no('exclusão aceitou confirmação errada', `status=${semNome.status} existe=${sobreviveu?.length}`)

// ── 5. excluir de verdade, e dizer o que foi apagado ────────────────────────
const del = await call(`/api/circles/${circleId}`, 'DELETE', { confirmName: 'Família Libânio' })
const foi = await admin(`/rest/v1/circles?id=eq.${circleId}&select=id`).then(r => r.json())
const membrosOrfaos = await admin(`/rest/v1/circle_members?circle_id=eq.${circleId}&select=user_id`).then(r => r.json())
del.body?.ok && foi?.length === 0 && membrosOrfaos?.length === 0 && del.body.deleted?.members === 2
  ? ok('círculo excluído em cascata, com o que se perdeu', JSON.stringify(del.body.deleted))
  : no('exclusão incompleta', `${JSON.stringify(del.body)} restaram=${JSON.stringify(membrosOrfaos)}`)

await browser.close()
stopServer()
for (const u of [dono, membro, intruso]) {
  await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'DELETE' })
}
await admin(`/rest/v1/circles?id=eq.${circleId}`, { method: 'DELETE' })

console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
