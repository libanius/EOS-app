/**
 * Uma porta só para "quem mora aqui" (D-135 fase 2).
 *
 * O app tinha três lugares para dizer quem mora na casa e eles não se
 * conheciam. O mais absurdo dos casos: a tela `/family/cadastro` se chama
 * literalmente **"Quem mora aqui"** e NÃO mostrava os convites — o nome que a
 * pessoa digita ao preencher o endereço virava uma linha invisível. Ela
 * cadastrava a filha num lugar e não a encontrava no outro, então cadastrava de
 * novo, e a casa passava a contar duas.
 *
 * O que este teste prova:
 *
 *   1. um nome digitado NO ENDEREÇO aparece na tela "Quem mora aqui"
 *   2. as três formas de morar aparecem juntas: conta, dependente, convidada
 *   3. cada uma diz o que É — quem recebe alerta e quem não
 *   4. o endereço leva até a lista única em vez de virar uma segunda lista
 *   5. a casa conta as três                                  ← consistência
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
const PORT = Number(process.env.PORT || 3081)
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

const email = `eos-porta-${Date.now()}@test.internal`
const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
track.user(u.id)
await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Paulo', location_lat: 26.31, location_lng: -80.2 }) })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', hasTouch: true, isMobile: true })
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})

// ── O endereço, com duas pessoas: uma com celular, uma sem ─────────────────
const salvou = await page.evaluate(async () => {
  const r = await fetch('/api/household/address', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: { country: 'US', line1: '5851 Holmberg Rd', unit: '4124', city: 'Parkland', region: 'FL', postal: '33067' },
      residents: [
        { name: 'Daniela Oliveira Letteriello', hasPhone: true },
        { name: 'Dona Marlene', hasPhone: false },
      ],
    }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
})

salvou.body?.pendingInvites === 1 && salvou.body?.dependents === 1
  ? ok('o endereço bifurca: quem tem celular vira convite, quem não vira dependente', JSON.stringify({ convites: salvou.body.pendingInvites, dependentes: salvou.body.dependents }))
  : no('a bifurcação do endereço quebrou', JSON.stringify(salvou))

// ── 1, 2 e 3. a tela "Quem mora aqui" mostra tudo ──────────────────────────
await page.goto(`${B}/family/cadastro`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3500)

const naTela = await page.evaluate(() => document.body.innerText)

naTela.includes('Daniela')
  ? ok('o nome digitado NO ENDEREÇO aparece em "Quem mora aqui"', 'Daniela, que era invisível aqui')
  : no('o convite continua invisível na tela que promete listar a casa', naTela.slice(0, 200).replace(/\n+/g, ' · '))

naTela.includes('Dona Marlene') && naTela.includes('Daniela')
  ? ok('as duas formas aparecem na mesma tela', 'dependente e convidada')
  : no('falta uma das formas', naTela.slice(0, 200).replace(/\n+/g, ' · '))

/*
 * A distinção é o que muda o comportamento da família: quem tem conta recebe
 * alerta, quem não tem depende de alguém avisar. Uma lista que não diz isso
 * parece completa e não é.
 */
naTela.includes('não recebe') || naTela.includes('não entraram') || naTela.includes('recebe alerta')
  ? ok('a tela diz quem recebe alerta e quem não', 'a distinção que muda o comportamento')
  : no('a lista não distingue conta de convite', naTela.slice(0, 240).replace(/\n+/g, ' · '))

// ── 4. o endereço leva até a lista, em vez de virar outra lista ────────────
/*
 * A primeira versão deste item só contava links para `/family/cadastro` na
 * ficha — e passava sem testar nada, porque um desses links já existia antes.
 * O que mudou é a FRASE depois de salvar, que diz para onde os nomes foram.
 * Então o teste preenche o formulário de verdade.
 */
await page.goto(`${B}/ficha`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)

const formulario = page.locator('.home-address')
if (!(await formulario.count())) {
  no('não achei o formulário de endereço na ficha')
} else {
  await formulario.locator('select').first().selectOption('US')
  await page.waitForTimeout(400)
  const campos = formulario.locator('input.ha-input')
  await campos.nth(0).fill('900 Sample Ave')     // rua
  await campos.nth(1).fill('7B')                 // unidade
  await campos.nth(2).fill('Coral Springs')      // cidade
  await page.waitForTimeout(400)

  // Com rua e cidade, a pergunta "mais alguém mora aqui?" aparece.
  const nome = formulario.locator('.ha-people input.ha-input')
  if (await nome.count()) {
    await nome.fill('Tio Bento Alvarenga')
    await formulario.locator('button.ha-btn:not(.primary)').first().click()
    await page.waitForTimeout(300)
  }

  await formulario.locator('button.ha-btn.primary').click()
  await page.waitForTimeout(6000)

  const texto = await formulario.innerText()
  const levaAteLa = await formulario.locator('a[href="/family/cadastro"]').count()
  // `const`, e não uma linha começando com `/`: depois de `)` o parser lê a
  // barra como divisão. É a sexta vez que esta armadilha aparece neste repo.
  const disseParaOnde = /(pessoa foi|pessoas foram) para a lista da casa/.test(texto)
  disseParaOnde && levaAteLa > 0
    ? ok('depois de salvar, o endereço diz para onde os nomes foram', texto.split('\n').find(l => l.includes('lista da casa'))?.trim() ?? '')
    : no('o nome é digitado e a pessoa fica sem saber onde ele foi parar', texto.slice(-220).replace(/\n+/g, ' · '))
}

// ── 5. a casa conta as três ────────────────────────────────────────────────
const casa = await page.evaluate(async () => (await fetch('/api/household')).json())
// Eu + Dona Marlene (dependente) = 2 na conta de pessoas; a Daniela ainda é
// convite, e convite não vira boca até entrar.
/*
 * Eu + Dona Marlene = 2 bocas. Daniela e Tio Bento são CONVITES, e convite não
 * vira boca até a pessoa entrar.
 *
 * O Tio Bento virou convite e não dependente porque o formulário marca "tem
 * celular" por padrão, e o teste não desmarcou. Minha expectativa é que estava
 * errada, não o produto: o padrão está certo, porque o caminho do convite é
 * reversível e criar um dependente escreve um registro.
 */
const esperados = ['Daniela', 'Tio Bento']
casa?.size === 2 && esperados.every(n => (casa.pendingNames ?? []).some(p => p.includes(n)))
  ? ok('a casa conta as bocas e sabe de quem falta', `size=${casa.size} · esperando: ${casa.pendingNames.join(', ')}`)
  : no('a casa não bate com a tela', JSON.stringify({ size: casa?.size, pend: casa?.pendingNames }))

await browser.close()
stopServer()
await admin(`/rest/v1/household_invites?owner_id=eq.${u.id}`, { method: 'DELETE' }).catch(() => {})
console.log(`\n${pass} passaram, ${fail} falharam`)
await finish(fail)
