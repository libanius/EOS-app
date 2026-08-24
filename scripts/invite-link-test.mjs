/**
 * O link de convite, ponta a ponta (D-112).
 *
 * Convidar alguém exigia ditar um código de seis letras e esperar a pessoa
 * digitar certo, achar a tela e colar. Um link tira as três chances de erro.
 *
 *   1. abrir /convite/CODIGO cria o pedido de entrada, sem digitar nada
 *   2. com ?intima=1 o pedido carrega a intenção de Família íntima
 *   3. ao APROVAR, o membro nasce com Família íntima PENDENTE — nunca aprovada
 *   4. quem já é membro recebe "você já faz parte", não um pedido duplicado
 *   5. código inexistente falha com mensagem, sem criar nada
 *   6. o botão E a caixa de Família íntima existem nas DUAS telas — comecei com
 *      a variante compacta em Círculos e metade da feature ficou invisível
 *
 * O item 3 é a trava que importa: um link pode FAZER a pergunta sobre a ficha
 * médica de alguém, nunca respondê-la. Se algum dia isto virar 'approved', a
 * ficha de uma pessoa passa a ser aberta por quem encaminhou um link.
 *
 * ATENÇÃO: cria e apaga contas no Supabase de produção.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })
import { track, cleanupOnExit } from './lib/test-cleanup.mjs'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3024)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'

const admin = (p, o = {}) => fetch(`${URL}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

// D-114: a limpeza acontece em QUALQUER saída — inclusive quando uma asserção
// estoura no meio. Foi o "só limpa no fim" que deixou 32 contas de teste no
// banco de produção.
cleanupOnExit(admin)

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

// A migration D-112 pode não estar aplicada; o teste precisa saber diferenciar
// "o link não carregou a intenção" de "a coluna ainda não existe".
const colunaOk = await admin('/rest/v1/circle_join_requests?select=wants_family_access&limit=1').then(r => r.ok)

async function mkUser(name) {
  const email = `eos-inv-${name}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
  track.user(u.id)
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
  await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})
  return page
}

const dono = await mkUser('Dono')
const convidado = await mkUser('Convidado')
const code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6)
const circle = await admin('/rest/v1/circles', { method: 'POST', body: JSON.stringify({
  name: 'Casa Libânio', leader_id: dono.id, invite_code: code,
}) }).then(r => r.json())
track.circle(circle[0]?.id)
await admin('/rest/v1/circle_members', { method: 'POST', body: JSON.stringify([
  { circle_id: circle[0].id, user_id: dono.id, role: 'Admin', share_inventory: true, shared_fields: [] },
]) })
console.log(`— círculo "Casa Libânio", convite ${code}${colunaOk ? '' : ' (migration D-112 NÃO aplicada)'}\n`)

const browser = await chromium.launch({ args: ['--no-sandbox'] })

// ── 1 e 2. o convidado abre o link, com Família íntima ──────────────────────
const guest = await login(browser, convidado)
await guest.goto(`${B}/convite/${code}?intima=1`, { waitUntil: 'networkidle' })
await guest.waitForTimeout(3000)
const tela = await guest.locator('.invite-box').innerText().catch(() => '')

const pedido = await admin(`/rest/v1/circle_join_requests?circle_id=eq.${circle[0].id}&requester_id=eq.${convidado.id}&select=status,wants_family_access`).then(r => r.json())
pedido?.[0]?.status === 'pending' && /pedido enviado/i.test(tela)
  ? ok('o link cria o pedido de entrada sem digitar código', tela.split('\n')[1] ?? '')
  : no('o link não criou o pedido', `${JSON.stringify(pedido)} · ${tela.slice(0, 120).replace(/\n+/g, ' ')}`)

if (colunaOk) {
  pedido?.[0]?.wants_family_access === true
    ? ok('o link carrega a intenção de Família íntima')
    : no('intenção de Família íntima não foi registrada', JSON.stringify(pedido))
} else {
  /família íntima/i.test(tela)
    ? ok('sem a migration, a tela AVISA que a Família íntima ficará para depois')
    : no('sem a migration, a tela ficou calada sobre a Família íntima', tela.slice(0, 140).replace(/\n+/g, ' '))
}

// ── 3. aprovar deixa Família íntima PENDENTE, nunca aprovada ────────────────
const owner = await login(browser, dono)
const reqRow = await admin(`/rest/v1/circle_join_requests?circle_id=eq.${circle[0].id}&requester_id=eq.${convidado.id}&select=id`).then(r => r.json())
const aprovacao = await owner.evaluate(async ({ cid, rid }) => {
  const r = await fetch(`/api/circles/${cid}/requests/${rid}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}, { cid: circle[0].id, rid: reqRow[0].id })

const membro = await admin(`/rest/v1/circle_members?circle_id=eq.${circle[0].id}&user_id=eq.${convidado.id}&select=role,family_access_status`).then(r => r.json())
const virouMembro = aprovacao.status < 400 && membro?.[0]?.role === 'Viewer'
const acessoEsperado = colunaOk ? 'requested' : 'none'
virouMembro && (membro[0].family_access_status ?? 'none') === acessoEsperado
  ? ok(`aprovado como membro, Família íntima em "${membro[0].family_access_status ?? 'none'}"`, 'nunca aprovada por link')
  : no('estado errado após a aprovação', `membro=${virouMembro} acesso=${membro?.[0]?.family_access_status} esperado=${acessoEsperado}`)

// A trava que mais importa: o link NUNCA pode conceder acesso à ficha.
membro?.[0]?.family_access_status !== 'approved'
  ? ok('o link não abre a ficha de ninguém', 'quem decide é a própria pessoa')
  : no('PERIGO: link concedeu acesso à ficha médica', JSON.stringify(membro))

// ── 4. quem já é membro não gera pedido duplicado ───────────────────────────
await guest.goto(`${B}/convite/${code}`, { waitUntil: 'networkidle' })
await guest.waitForTimeout(2500)
const jaMembro = await guest.locator('.invite-box').innerText().catch(() => '')
// A regex vai numa const: linha começando com `/` logo após `)` vira divisão.
const reconheceu = /já faz parte/i.test(jaMembro)
reconheceu
  ? ok('quem já é membro recebe "você já faz parte"')
  : no('membro existente não foi reconhecido', jaMembro.slice(0, 120).replace(/\n+/g, ' '))

// ── 5. código inexistente falha sem criar nada ──────────────────────────────
await guest.goto(`${B}/convite/ZZZZZZ`, { waitUntil: 'networkidle' })
await guest.waitForTimeout(2500)
const invalido = await guest.locator('.invite-box').innerText().catch(() => '')
const pedidosDoConvidado = await admin(`/rest/v1/circle_join_requests?requester_id=eq.${convidado.id}&select=id`).then(r => r.json())
const recusou = /não deu para entrar|não existe mais/i.test(invalido)
recusou && pedidosDoConvidado.length === 1
  ? ok('código inexistente falha com mensagem e não cria nada')
  : no('código inválido não tratado', `${invalido.slice(0, 100).replace(/\n+/g, ' ')} · pedidos=${pedidosDoConvidado.length}`)

// ── 6. o convite existe nas duas telas, com a opção de Família íntima ───────
// Eu usei a variante `compact` em Círculos e a caixa sumiu: dava para mandar o
// link, mas nunca para incluir alguém na Família íntima — metade da feature
// invisível, sem nenhum aviso. Contar os dois elementos é o que impede a volta.
const telas = []
for (const rota of ['/circles', '/family']) {
  await owner.goto(`${B}${rota}`, { waitUntil: 'networkidle' })
  await owner.waitForTimeout(3000)
  telas.push({
    rota,
    botao: await owner.locator('.invite-share-btn').count(),
    caixa: await owner.locator('.invite-share-family input[type=checkbox]').count(),
  })
}
telas.every(t => t.botao > 0 && t.caixa > 0)
  ? ok('convite com Família íntima nas duas telas', telas.map(t => `${t.rota} ${t.botao}/${t.caixa}`).join(' · '))
  : no('convite ausente ou sem a opção de Família íntima', JSON.stringify(telas))

await browser.close()
stopServer()
for (const u of [dono, convidado]) {
  await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'DELETE' })
}
await admin(`/rest/v1/circles?id=eq.${circle[0].id}`, { method: 'DELETE' })

console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
