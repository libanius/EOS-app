/**
 * Verificação de push em PRODUÇÃO, pós-deploy (D-074).
 *
 * O `push-test.mjs` prova a corrente inteira, mas sobe o próprio servidor local
 * (precisa que o servidor confie no CA do serviço de push falso). Este script
 * cobre o que aquele não alcança: se o service worker **realmente instala e
 * ativa no deploy que está no ar**, e se o `push-sw.js` de lá exibe notificação.
 *
 * Existe porque a falha original era invisível: o precache do Workbox é atômico,
 * então UM arquivo 404 no manifesto rejeita o install, o worker vira `redundant`
 * e nenhum push chega — sem erro nenhum na página. Rodar isto depois de todo
 * deploy que toque `next.config.mjs`, o next-pwa ou a versão do Next.
 *
 * Exige Google Chrome instalado (o Chromium do Playwright nega permissão de
 * notificação).
 *
 *   node scripts/push-prod-check.mjs [url]
 */
import { chromium } from 'playwright'

const B = (process.argv[2] || 'https://eos-app-fawn.vercel.app').replace(/\/$/, '')

let pass = 0, fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

console.log(`— verificando ${B}\n`)

// ── 1. todo URL do precache responde 200 ─────────────────────────────────────
const sw = await fetch(`${B}/sw.js`).then(r => (r.ok ? r.text() : null))
if (!sw) { console.error('sw.js não respondeu 200'); process.exit(1) }

const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map(m => m[1])
const bad = []
for (const u of urls) {
  const r = await fetch(`${B}${u.startsWith('/') ? u : `/${u}`}`).catch(() => null)
  if (!r?.ok) bad.push(`${r?.status ?? 'ERR'} ${u}`)
}
const handlerOk = await fetch(`${B}/push-sw.js`).then(r => r.ok).catch(() => false)
urls.length && !bad.length && sw.includes('importScripts("/push-sw.js")') && handlerOk
  ? ok('precache 100% buscável', `${urls.length} arquivos, push-sw.js importado`)
  : no('precache quebrado', bad.slice(0, 5).join(' | ') || `push-sw=${handlerOk} urls=${urls.length}`)

// ── 2. o service worker instala e ativa, sem erro ────────────────────────────
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--no-sandbox'] })
const ctx = await browser.newContext()
await ctx.grantPermissions(['notifications'], { origin: B })
const page = await ctx.newPage()

const errors = []
let regId = null
const cdp = await ctx.newCDPSession(page)
await cdp.send('ServiceWorker.enable')
cdp.on('ServiceWorker.workerErrorReported', e => errors.push(e.errorMessage))
cdp.on('ServiceWorker.workerRegistrationUpdated', e => {
  for (const r of e.registrations) if (r.scopeURL.startsWith(B)) regId = r.registrationId
})

await page.goto(`${B}/auth/login`, { waitUntil: 'domcontentloaded' })
const state = await page.evaluate(async () => {
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise(r => setTimeout(() => r(null), 25000)),
    ])
    return reg?.active?.state ?? 'não ativou'
  } catch (e) { return String(e) }
})
;(state === 'activated' || state === 'activating') && !errors.length
  ? ok('service worker instalou e ativou em produção', state)
  : no('service worker', `${state}${errors.length ? ' · ' + JSON.stringify(errors[0]) : ''}`)

// ── 3. o push-sw.js do deploy exibe notificação ──────────────────────────────
if (regId !== null) {
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: B,
    registrationId: String(regId),
    data: JSON.stringify({ title: 'EOS · verificação', body: 'Deploy conferido', url: '/dashboard' }),
  }).catch(e => errors.push(String(e)))
  await page.waitForTimeout(2500)
}
const shown = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? (await reg.getNotifications()).map(n => ({ title: n.title, body: n.body })) : []
})
shown.some(n => n.body === 'Deploy conferido')
  ? ok('push-sw.js do deploy exibiu a notificação', JSON.stringify(shown))
  : no('nenhuma notificação exibida', `regId=${regId} · ${JSON.stringify(shown)}`)

await browser.close()
console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
