/**
 * Erro do navegador vira linha, e o dono fica sabendo (D-119).
 *
 * O `error_log` do D-118 cobria só o servidor, e dependia de alguém lembrar de
 * consultar. Este teste prova as duas metades que faltavam:
 *
 *   1. um erro de JavaScript de VERDADE, não capturado, na tela do usuário,
 *      chega ao `error_log`
 *   2. ruído conhecido é descartado          ← controle negativo
 *   3. a mesma falha em laço grava UMA linha ← controle negativo
 *   4. token na URL não vira log             ← controle negativo
 *   5. o aviso ao dono sai, com push
 *   6. rodando de novo em seguida, NÃO repete o aviso (marca d'água funciona)
 *
 * Os controles negativos existem porque este projeto já teve teste passando sem
 * testar nada quatro vezes. Provar que a coisa grava é metade; a outra metade é
 * provar que ela NÃO grava o que não deve.
 *
 * ATENÇÃO: escreve no Supabase de produção e apaga o que criou. O passo 5 envia
 * um push de verdade para a conta configurada em ERROR_ALERT_USER_IDS.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3027)
const B = `http://localhost:${PORT}`
const MARCA = `EOS-TESTE-${Date.now()}`

const admin = (p, o = {}) => fetch(`${URL_SB}${p}`, {
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
  up = await fetch(`${B}/auth/login`).then(r => r.status < 500).catch(() => false)
}
if (!up) { console.error('Servidor não subiu'); stopServer(); process.exit(1) }

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, locale: 'pt-BR' })

/** Um erro NÃO CAPTURADO, do jeito que acontece de verdade. */
const estourar = (msg, vezes = 1) => page.evaluate(({ msg, vezes }) => {
  for (let i = 0; i < vezes; i += 1) setTimeout(() => { throw new Error(msg) }, 0)
  return new Promise(r => setTimeout(r, 400))
}, { msg, vezes })

const buscar = async filtro => {
  const r = await admin(`/rest/v1/error_log?select=id,scope,message,context&${filtro}`).then(x => x.json())
  return Array.isArray(r) ? r : []
}

// ── 1. erro real do navegador vira linha ────────────────────────────────────
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await estourar(`${MARCA}-real`)
await new Promise(r => setTimeout(r, 1200))
const gravados = await buscar(`message=like.*${MARCA}-real*`)
gravados.length === 1 && gravados[0].scope.startsWith('client')
  ? ok('erro não capturado na tela chega ao error_log', `scope=${gravados[0].scope}`)
  : no('erro do navegador não foi registrado', JSON.stringify(gravados).slice(0, 200))

// ── 2. controle negativo: ruído conhecido é descartado ──────────────────────
await estourar('ResizeObserver loop completed with undelivered notifications.')
await new Promise(r => setTimeout(r, 1200))
const ruido = await buscar('message=like.*ResizeObserver*')
ruido.length === 0
  ? ok('ruído conhecido NÃO vira linha', 'ResizeObserver descartado')
  : no('ruído entrou no log', JSON.stringify(ruido).slice(0, 200))

// ── 3. controle negativo: laço grava uma vez só ─────────────────────────────
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await estourar(`${MARCA}-laco`, 30)
await new Promise(r => setTimeout(r, 1500))
const laco = await buscar(`message=like.*${MARCA}-laco*`)
laco.length === 1
  ? ok('30 disparos da mesma falha gravam UMA linha', 'sem repetição')
  : no('repetição não foi contida', `${laco.length} linhas para 30 disparos`)

// ── 4. controle negativo: token na URL não vira log ─────────────────────────
await page.goto(`${B}/auth/login?token=SEGREDO-${MARCA}&code=abc`, { waitUntil: 'networkidle' })
await estourar(`${MARCA}-url`)
await new Promise(r => setTimeout(r, 1200))
const comUrl = await buscar(`message=like.*${MARCA}-url*`)
const texto = JSON.stringify(comUrl)
comUrl.length === 1 && !texto.includes('SEGREDO')
  ? ok('query da URL é removida antes de gravar', `pagina=${comUrl[0]?.context?.pagina}`)
  : no('token da URL vazou para o log', texto.slice(0, 250))

await browser.close()

// ── 5. o dono é avisado, com push ───────────────────────────────────────────
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(URL_SB, KEY, { auth: { persistSession: false } })
const donos = (process.env.ERROR_ALERT_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)

// A escape hatch precisa GRITAR. Um teste que troca de caminho em silêncio é
// como este projeto já passou verde quatro vezes sem testar nada.
const mod = await import('../lib/error-alerts.ts').catch(e => {
  console.log(`   [caminho] import direto indisponível (${e.message.slice(0, 60)}) — usando o cron`)
  return {}
})
const { avisarErrosNovos } = mod
if (avisarErrosNovos) console.log('   [caminho] chamando lib/error-alerts diretamente')
let aviso = null
if (avisarErrosNovos) {
  aviso = await avisarErrosNovos(sb)
} else {
  // Sem tsx disponível, exercita o caminho pelo cron — mesmo código.
  const r = await fetch(`${B}/api/cron/weather-notifications`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })
  aviso = (await r.json().catch(() => null))?.errorAlert ?? null
}

const avisou = aviso && typeof aviso === 'object' && aviso.novos > 0
avisou
  ? ok('dono é avisado dos erros novos', `${aviso.novos} erro(s) · push enviados=${aviso.push?.sent ?? 0} semAparelho=${aviso.push?.noDevice ?? 0}`)
  : no('aviso não saiu', JSON.stringify(aviso))

// ── 6. rodando de novo, não repete ──────────────────────────────────────────
let segundo = null
if (avisarErrosNovos) {
  segundo = await avisarErrosNovos(sb)
} else {
  const r = await fetch(`${B}/api/cron/weather-notifications`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } })
  segundo = (await r.json().catch(() => null))?.errorAlert ?? null
}
segundo === 'sem erro novo'
  ? ok('segunda rodada não repete o aviso', 'marca d\'água segura')
  : no('aviso repetiria a cada 15 minutos', JSON.stringify(segundo))

// ── limpeza ─────────────────────────────────────────────────────────────────
stopServer()
const meus = await buscar(`message=like.*${MARCA}*`)
for (const l of meus) await admin(`/rest/v1/error_log?id=eq.${l.id}`, { method: 'DELETE' })
for (const d of donos) {
  await admin(`/rest/v1/circle_notifications?kind=eq.error_alert&recipient_id=eq.${d}`, { method: 'DELETE' })
}
console.log(`   [limpeza] ${meus.length} linha(s) de erro e os avisos de teste removidos`)

console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
