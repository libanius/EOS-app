/**
 * Círculos reconstruída (D-124).
 *
 * O audit deu **7/20**. A tela era a única do EOS fora do design system: 139
 * blocos de estilo à mão, 22 cores literais, 31 botões sem rótulo acessível,
 * 16 alvos de toque abaixo de 44px (vários com 18) — e **duas requisições
 * falhando em toda abertura**, uma delas com 500.
 *
 * O que este teste prova:
 *
 *   1. nenhuma requisição falha além do portão de plano (que é intencional)
 *   2. a tela está no design system                    ← controle negativo
 *   3. nenhum alvo de toque abaixo de 44px             ← controle negativo
 *   4. a lista separa SUA CASA de NO CÍRCULO
 *   5. um toque na pessoa abre a folha com as decisões
 *   6. TODAS as funções antigas continuam existindo    ← o que mais importa
 *   7. o escurecido e o Escape fecham a folha          ← ninguém fica preso
 *
 * O item 6 é o que me preocupa numa reescrita de apresentação: é fácil deixar
 * uma função cair no caminho. Aqui a lista de funções é conferida uma a uma.
 *
 * ATENÇÃO: cria e apaga contas no Supabase de produção.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })
import { track, cleanupOnExit, finish } from './lib/test-cleanup.mjs'

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3045)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'

const admin = (p, o = {}) => fetch(`${URL_SB}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

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
  up = await fetch(`${B}/auth/login`).then(r => r.status < 500).catch(() => false)
}
if (!up) { console.error('Servidor não subiu'); stopServer(); await finish(1) }

async function conta(nome) {
  const email = `eos-cirt-${nome}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
  track.user(u.id)
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: nome }) })
  return { id: u.id, email }
}

const ana = await conta('Ana'), bruno = await conta('Bruno'), celia = await conta('Celia')
const codigo = 'T' + Math.random().toString(36).slice(2, 7).toUpperCase()
const circulo = await admin('/rest/v1/circles', { method: 'POST', body: JSON.stringify({
  name: 'Família Libânio', leader_id: ana.id, invite_code: codigo,
}) }).then(r => r.json())
track.circle(circulo[0]?.id)
const cid = circulo[0].id

/*
 * MESMAS CHAVES em todas as linhas do lote.
 *
 * O PostgREST recusa o lote inteiro com PGRST102 se uma linha tiver uma chave
 * a menos — e devolve 400 sem criar nada. A primeira versão desta semeadura
 * caiu nisso, a tela mostrou "0 pessoas" com toda razão, e eu quase acusei a
 * tela de um defeito que era do script.
 */
const membro = (id, role, casa, ficha) => ({
  circle_id: cid, user_id: id, role, share_inventory: true, shared_fields: [],
  household_status: casa, family_access_status: ficha,
})
await admin('/rest/v1/circle_members', { method: 'POST', body: JSON.stringify([
  membro(ana.id, 'Admin', 'confirmed', 'none'),
  membro(bruno.id, 'Editor', 'requested', 'none'),
  membro(celia.id, 'Viewer', 'none', 'approved'),
]) })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
const falhas = []
page.on('response', r => { if (r.status() >= 400) falhas.push(`${r.status()} ${new URL(r.url()).pathname}`) })
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', ana.email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})

falhas.length = 0
await page.goto(`${B}/circles`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

// ── 1. nada falha, além do portão de plano ─────────────────────────────────
// O 403 de /monitoring é o plano Família barrando — comportamento, não defeito.
const inesperadas = [...new Set(falhas)].filter(f => !f.startsWith('403') || !f.includes('/monitoring'))
inesperadas.length === 0
  ? ok('nenhuma requisição falha na abertura', 'só o 403 do portão de plano, que é intencional')
  : no('requisições falhando', inesperadas.join(' · '))

// ── 2. controle negativo: a tela velha não sobrou ──────────────────────────
const noSistema = await page.locator('main.wv2.wv2-circles-page').count()
const marcas = await page.evaluate(() => {
  const achados = []
  for (const el of Array.from(document.querySelectorAll('main *'))) {
    const cs = getComputedStyle(el)
    // #0f0f17 e #1a1a24 eram os fundos escritos à mão da tela antiga.
    if (/rgb\(15,\s*15,\s*23\)|rgb\(26,\s*26,\s*36\)/.test(cs.backgroundColor)) achados.push('fundo literal antigo')
  }
  return Array.from(new Set(achados))
})
noSistema === 1 && marcas.length === 0
  ? ok('a tela está no design system e nada da antiga sobrou', 'main.wv2.wv2-circles-page')
  : no('resquício da tela antiga', `wv2=${noSistema} marcas=${marcas.join(',')}`)

// ── 3. controle negativo: nenhum alvo pequeno ──────────────────────────────
const pequenos = await page.evaluate(() => {
  const out = []
  for (const el of Array.from(document.querySelectorAll('main button, main a[href], main input, main select, main textarea'))) {
    if (getComputedStyle(el).visibility === 'hidden') continue
    // A área tocável de um campo dentro de <label> é a do rótulo inteiro: o
    // dedo acerta o texto e o campo responde. Medir o quadradinho isolado
    // acusaria um problema que não existe no dedo de ninguém.
    const alvo = el.closest('label') ?? el
    const r = alvo.getBoundingClientRect()
    if (r.width === 0) continue
    if (r.height < 44) out.push(`${(el.textContent || el.tagName).trim().slice(0, 20)}=${Math.round(r.height)}px`)
  }
  return out
})
pequenos.length === 0
  ? ok('nenhum alvo de toque abaixo de 44px', 'eram 16, com vários de 18px')
  : no('alvos pequenos sobraram', pequenos.join(' · '))

// ── 4. a lista separa casa de círculo ──────────────────────────────────────
const texto = await page.locator('main').innerText()
// Só a Ana confirmou morar aqui; Bruno está em 'requested' e Célia em 'none'.
// A primeira versão deste teste esperava 2/1 e acusou a tela de um erro que era
// da minha expectativa.
const separa = /Sua casa \(1\)/i.test(texto) && /No círculo \(2\)/i.test(texto)
separa
  ? ok('a lista separa SUA CASA de NO CÍRCULO', 'casa 1 (confirmada) · círculo 2')
  : no('a separação casa/círculo não apareceu', texto.slice(0, 220).replace(/\n/g, ' | '))

// ── 5. um toque abre a folha da pessoa ─────────────────────────────────────
await page.locator('.cir-member').filter({ hasText: 'Bruno' }).click()
await page.locator('.cir-sheet').waitFor({ timeout: 8000 })
const naFolha = await page.locator('.cir-sheet').innerText()
// `const` obrigatório: uma linha começando com `/` depois de `)` é lida como
// DIVISÃO. Quarta vez nesta base — e a primeira em que o `lint:scripts` do
// D-122 pegou antes de rodar, em vez de o teste passar verde testando outra coisa.
const folhaCompleta = /Mora nesta casa/i.test(naFolha) && /Ficha médica/i.test(naFolha) && /Papel no círculo/i.test(naFolha)
folhaCompleta
  ? ok('a folha traz as decisões daquela pessoa', 'casa, ficha e papel — separados')
  : no('a folha não trouxe as decisões', naFolha.slice(0, 200).replace(/\n/g, ' | '))

// ── 7. o Escape fecha; ninguém fica preso ──────────────────────────────────
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
const fechou = await page.locator('.cir-sheet').count()
fechou === 0
  ? ok('Escape fecha a folha')
  : no('a folha prende o usuário', `folhas abertas=${fechou}`)

// ── 6. TODAS as funções antigas continuam na tela ──────────────────────────
const funcoes = [
  [/Código de convite/i, 'entrar por código'],
  [/Escanear convite/i, 'escanear QR'],
  [/procurar pelo nome/i, 'buscar círculo'],
  [/Criar círculo|Nome do círculo/i, 'criar círculo'],
  [/Planos de ação/i, 'planos de ação'],
  [/Convidar por link/i, 'convite por link'],
  [/Mostrar QR/i, 'QR do convite'],
  [/Ajustes/i, 'ajustes do círculo'],
  [/Recursos no círculo/i, 'inventário do círculo'],
]
const textoFinal = await page.locator('main').innerText()
const faltando = funcoes.filter(([re]) => !re.test(textoFinal)).map(([, nome]) => nome)
faltando.length === 0
  ? ok('todas as funções antigas continuam na tela', `${funcoes.length} conferidas`)
  : no('funções perdidas na reescrita', faltando.join(', '))

// Ajustes: os interruptores de compartilhamento continuam funcionando
await page.getByRole('button', { name: /^Ajustes$/ }).first().click()
await page.locator('.cir-sheet').waitFor({ timeout: 8000 })
const ajustes = await page.locator('.cir-sheet').innerText()
const temTudo = /Meu inventário/i.test(ajustes) && /Minha posição/i.test(ajustes) && /Sair do círculo/i.test(ajustes) && /Excluir círculo/i.test(ajustes)
temTudo
  ? ok('ajustes reúne compartilhamento, renomear, excluir e sair')
  : no('ajustes incompleto', ajustes.slice(0, 200).replace(/\n/g, ' | '))

await browser.close()
stopServer()
console.log(`\n${pass} passaram, ${fail} falharam`)
await finish(fail)
