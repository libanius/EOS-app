/**
 * As capacidades do Pilot, com navegador e modelo REAIS (D-079).
 *
 *   0. NENHUMA página fica coberta pelo Pilot — a regressão que ele causou
 *   1. o orbe existe fora do dashboard, e pode ser ARRASTADO para onde a pessoa
 *      quiser, ficando lá depois de recarregar
 *   2. ele responde sobre o CLIMA AO VIVO sem dizer que não enxerga
 *   3. ele enxerga o ciclone ativo, e diz se aquilo afeta a pessoa
 *   4. "vou trabalhar no telhado" vira ANÁLISE: veredito, motivo com números,
 *      janela e precauções que viram tarefas
 *
 * Os itens 2 e 4 chamam o modelo de verdade. Isso deixa o teste mais lento e
 * um pouco menos determinístico, e é proposital: o defeito relatado pelo dono
 * ("perguntei do evento climático e ele disse que não enxerga") não é
 * reproduzível sem o modelo no meio. As asserções olham SUBSTÂNCIA — números
 * citados, ausência da negativa —, não frases exatas.
 *
 * ATENÇÃO: cria e apaga uma conta no Supabase de produção. Consome tokens.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3019)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'
const HOME = { latitude: 26.3106, longitude: -80.2456 }

const admin = (p, o = {}) => fetch(`${URL}${p}`, {
  ...o,
  headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=representation', ...o.headers },
})

let pass = 0, fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

if (!process.env.OPENAI_API_KEY) {
  console.error('Sem OPENAI_API_KEY: este teste exercita o modelo de verdade.')
  process.exit(1)
}
if (!fs.existsSync('.next/BUILD_ID')) { console.error('Faltou `npm run build`.'); process.exit(1) }

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: process.env, stdio: 'ignore' })
const stopServer = () => { try { server.kill('SIGTERM') } catch {} }
process.on('exit', stopServer)
let up = false
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise(r => setTimeout(r, 500))
  up = await fetch(`${B}/checklist`).then(r => r.status < 500).catch(() => false)
}
if (!up) { console.error('Servidor não subiu'); stopServer(); process.exit(1) }

const email = `eos-pilot-${Date.now()}@test.internal`
const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Pilot', location_lat: HOME.latitude, location_lng: HOME.longitude }) })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  viewport: { width: 420, height: 900 }, locale: 'pt-BR',
  permissions: ['geolocation'], geolocation: HOME,
})
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding/, { timeout: 30000 }).catch(() => {})

// ── 0. nenhuma página coberta ───────────────────────────────────────────────
// O dock envolvia o Pilot num `.wv2`, que é a casca do dashboard: fixed, inset 0
// e fundo preto. Resultado: cortina preta sobre todas as telas. Este teste
// percorre as páginas e confere que o conteúdo continua VISÍVEL e clicável.
const TELAS = ['/checklist', '/inventory', '/circles', '/weather', '/plan', '/scenario', '/family']
const cobertas = []
for (const rota of TELAS) {
  await page.goto(`${B}${rota}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const estado = await page.evaluate(() => {
    // Quem está no ponto central da tela? Se for um contêiner do Pilot, a página
    // está atrás de uma cortina.
    const meio = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
    // Marcador ESTÁVEL, não a classe de estilo: a primeira versão procurava
    // `.wv2-portal`, que só existe na versão CORRIGIDA — então o controle
    // negativo passou com o bug de volta. Um guarda que não pega o defeito que
    // motivou sua existência é pior que nenhum: dá confiança falsa.
    const dentroDoPortal = Boolean(meio?.closest('[data-eos-pilot-dock]'))
    const texto = (document.body.innerText ?? '').trim().length
    return { dentroDoPortal, texto, tag: meio?.className ?? '' }
  })
  if (estado.dentroDoPortal || estado.texto < 40) cobertas.push(`${rota} (${estado.tag || 'vazio'})`)
}
cobertas.length === 0
  ? ok('nenhuma página coberta pelo Pilot', `${TELAS.length} telas conferidas`)
  : no('páginas cobertas por cortina', cobertas.join(' · '))

// ── 1. o orbe existe fora do dashboard ──────────────────────────────────────
await page.goto(`${B}/checklist`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const orbe = page.locator('.wv2-dock-orb')
const temOrbe = await orbe.count()
temOrbe === 1
  ? ok('o Pilot é alcançável fora do dashboard')
  : no('orbe ausente fora do dashboard', `encontrados=${temOrbe}`)

// O orbe é arrastável: um canto fixo atrapalha alguém, e não existe canto certo.
if (temOrbe === 1) {
  const antesBox = await orbe.boundingBox()
  await page.mouse.move(antesBox.x + antesBox.width / 2, antesBox.y + antesBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(60, 220, { steps: 14 })
  await page.mouse.up()
  await page.waitForTimeout(600)
  const depoisBox = await orbe.boundingBox()
  const moveu = Math.abs(depoisBox.x - antesBox.x) > 40 || Math.abs(depoisBox.y - antesBox.y) > 40

  // E fica onde foi deixado: mover e o app esquecer é pior que não deixar mover.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const depoisReload = await page.locator('.wv2-dock-orb').boundingBox()
  const lembrou = depoisReload && Math.abs(depoisReload.x - depoisBox.x) < 12 && Math.abs(depoisReload.y - depoisBox.y) < 12

  moveu && lembrou
    ? ok('o orbe é arrastável e fica onde foi deixado', `${Math.round(antesBox.x)},${Math.round(antesBox.y)} → ${Math.round(depoisBox.x)},${Math.round(depoisBox.y)}`)
    : no('arrasto do orbe falhou', `moveu=${moveu} lembrou=${lembrou}`)

  // O toque simples continua abrindo o Pilot — o arrasto não pode roubar o clique.
  await page.locator('.wv2-dock-orb').click()
  await page.waitForTimeout(1200)
  const abriu = await page.locator('.wv2-pilot-chat').count()
  abriu === 1 ? ok('tocar no orbe ainda abre o Pilot') : no('o arrasto comeu o toque', `chats=${abriu}`)
  await page.keyboard.press('Escape').catch(() => {})
}

// E não deve haver DOIS caminhos para a mesma coisa no dashboard.
await page.goto(`${B}/dashboard`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const noDash = await page.locator('.wv2-dock-orb').count()
noDash === 0
  ? ok('no dashboard não há orbe duplicado', 'a PilotBar continua sendo a entrada')
  : no('orbe duplicado no dashboard', `encontrados=${noDash}`)

/** Pergunta ao Pilot pela PilotBar do dashboard e devolve o texto da resposta. */
/**
 * Pergunta ao Pilot e devolve APENAS a última resposta dele.
 *
 * Duas armadilhas que a primeira versão caiu em cheio:
 *
 *  - contar bolhas não serve: ao abrir, o chat já mostra o briefing local, então
 *    a contagem sobe antes de o modelo responder e o teste lia o briefing;
 *  - ler o fluxo inteiro também não: o briefing cita rajada e chuva, então
 *    "responde com números" passava sem o modelo ter dito nada.
 *
 * Esperar a RESPOSTA HTTP e ler a ÚLTIMA bolha remove as duas.
 */
async function perguntar(texto) {
  const resposta = page.waitForResponse(
    r => r.url().includes('/api/pilot/chat') && r.request().method() === 'POST',
    { timeout: 90000 },
  )
  await page.fill('.wv2-pilotbar input', texto)
  await page.keyboard.press('Enter')
  await resposta.catch(() => null)
  await page.waitForTimeout(1500)
  const bolhas = page.locator('.chat-pilot')
  const n = await bolhas.count().catch(() => 0)
  return n ? bolhas.nth(n - 1).innerText().catch(() => '') : ''
}

// ── 2. clima ao vivo, sem a negativa ────────────────────────────────────────
const clima = await perguntar('Qual a temperatura e o vento agora aqui?')
const negativa = /não tenho acesso|nao tenho acesso|não consigo ver|consulte (outro|um) (site|serviço|app)|verifique um aplicativo/i.test(clima)
const comNumero = /\d+\s*(°|graus|km\/h|mph)/i.test(clima)
!negativa && comNumero
  ? ok('responde o clima com números, sem negar acesso', clima.slice(0, 90).replace(/\n+/g, ' '))
  : no('Pilot cego para o clima', `negativa=${negativa} numeros=${comNumero} · ${clima.slice(0, 160).replace(/\n+/g, ' ')}`)

// ── 3. enxerga o ciclone ativo ──────────────────────────────────────────────
const cyc = await fetch(`${B}/api/world/cyclones?lat=${HOME.latitude}&lng=${HOME.longitude}`).then(r => r.json())
if (cyc.empty) {
  const semTempestade = await perguntar('Existe algum furacão ou tempestade tropical ativa agora?')
  // A regex vai numa const: começar a linha com `/` logo após um `)` faz o
  // parser ler divisão, não expressão regular.
  const negou = /nenhum|não há|nao ha|sem ciclone|sem tempestade/i.test(semTempestade)
  negou
    ? ok('sem ciclone ativo, o Pilot diz isso em vez de inventar')
    : no('inventou tempestade onde não há', semTempestade.slice(0, 140).replace(/\n+/g, ' '))
} else {
  const nome = cyc.storms[0].name
  const resposta = await perguntar('Existe algum furacão ou tempestade tropical ativa agora? Qual e onde?')
  const citou = new RegExp(nome, 'i').test(resposta)
  // Genevieve está a milhares de km: o Pilot precisa dizer que não afeta.
  const qualificou = /não afeta|nao afeta|longe|distante|sem impacto|não representa|nao representa/i.test(resposta)
  citou && qualificou
    ? ok('enxerga o ciclone e qualifica a distância', `${nome} · ${resposta.slice(0, 80).replace(/\n+/g, ' ')}`)
    : no('não enxergou ou não qualificou o ciclone', `citou=${citou} qualificou=${qualificou} · ${resposta.slice(0, 160).replace(/\n+/g, ' ')}`)
}

// ── 4. análise de atividade ─────────────────────────────────────────────────
const telhado = await perguntar('Vou trabalhar no telhado hoje à tarde. Posso?')
const temVeredito = /pode|não faça|nao faca|evite|adie|espere|sim|não/i.test(telhado)
const temNumeros = /\d+\s*(km\/h|mph|%|°|graus|uv)/i.test(telhado)
const temJanela = /(entre|antes|depois|até|manhã|tarde|noite|\d{1,2}\s*h|\d{1,2}:\d{2})/i.test(telhado)
const tarefas = await page.locator('.chat-task').count().catch(() => 0)
temVeredito && temNumeros && temJanela
  ? ok('analisa a atividade: veredito, números e janela', `${tarefas} tarefa(s) · ${telhado.slice(0, 100).replace(/\n+/g, ' ')}`)
  : no('não analisou a atividade', `veredito=${temVeredito} numeros=${temNumeros} janela=${temJanela} · ${telhado.slice(0, 200).replace(/\n+/g, ' ')}`)

await browser.close()
stopServer()
await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'DELETE' })

console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
