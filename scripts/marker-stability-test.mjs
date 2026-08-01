/**
 * O pino com foto não pode piscar (D-081).
 *
 * O dono relatou o marcador da própria foto piscando no mapa. Duas causas, as
 * duas confirmadas no código:
 *
 *  1. `/api/circles` assina as fotos a cada requisição, então `avatar_url` muda
 *     a cada consulta apontando para o MESMO arquivo. Com consulta a cada 15 s,
 *     o `src` da imagem mudava sozinho e o navegador rebaixava a foto.
 *  2. `placeOverlays` destruía e recriava TODOS os marcadores a cada
 *     atualização, remontando o `<img>`.
 *
 * "Não pisca" não se mede olhando: mede-se provando que o ELEMENTO do marcador
 * sobreviveu ao ciclo. O teste carimba o nó no DOM e confere que o carimbo
 * continua lá depois de duas rodadas de atualização — se o marcador tivesse sido
 * recriado, o carimbo teria ido embora com o nó antigo.
 *
 * ATENÇÃO: cria e apaga uma conta no Supabase de produção.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
config({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3021)
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

if (!fs.existsSync('.next/BUILD_ID')) { console.error('Faltou `npm run build`.'); process.exit(1) }
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: process.env, stdio: 'ignore' })
const stopServer = () => { try { server.kill('SIGTERM') } catch {} }
process.on('exit', stopServer)
let up = false
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise(r => setTimeout(r, 500))
  up = await fetch(`${B}/dashboard`).then(r => r.status < 500).catch(() => false)
}
if (!up) { console.error('Servidor não subiu'); stopServer(); process.exit(1) }

// Duas contas num círculo, ambas compartilhando posição: é o cenário em que o
// mapa desenha um pino de outra pessoa, com foto e rótulo.
async function mkUser(name) {
  const email = `eos-pin-${name}-${Date.now()}@test.internal`
  const u = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password: PASS, email_confirm: true }) }).then(r => r.json())
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name,
      location_lat: HOME.latitude,
      location_lng: HOME.longitude,
      last_location_lat: HOME.latitude + 0.004,
      last_location_lng: HOME.longitude + 0.004,
      last_location_at: new Date().toISOString(),
    }),
  })
  return { id: u.id, email, name }
}

/**
 * Uma foto REAL para a outra pessoa.
 *
 * Sem avatar, a asserção sobre a URL assinada compara duas listas vazias e passa
 * sem medir nada — a mesma válvula de escape que já deixou outro teste desta
 * suíte reportar verde sem testar. Um PNG de 1×1 basta: o que se mede é o `src`
 * mudar, não a imagem.
 */
async function darFoto(userId) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const path = `${userId}/avatar.png`
  const upload = await fetch(`${URL}/storage/v1/object/profile-photos/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: png,
  })
  if (!upload.ok) return false
  const patch = await admin('/rest/v1/profile_personalization', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ profile_id: userId, avatar_path: path }),
  })
  return patch.ok
}

const eu = await mkUser('Eu')
const outra = await mkUser('Daniela')
const comFoto = await darFoto(outra.id)
if (!comFoto) console.log('   (não consegui subir a foto de teste; a checagem de URL ficará sem medir)')
const circle = await admin('/rest/v1/circles', { method: 'POST', body: JSON.stringify({
  name: 'Pino Teste', leader_id: eu.id,
  invite_code: Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0').slice(0, 6),
}) }).then(r => r.json())
await admin('/rest/v1/circle_members', { method: 'POST', body: JSON.stringify([
  { circle_id: circle[0].id, user_id: eu.id, role: 'Admin', share_inventory: true, shared_fields: ['location'] },
  { circle_id: circle[0].id, user_id: outra.id, role: 'Editor', share_inventory: true, shared_fields: ['location'] },
]) })
console.log('— duas contas compartilhando posição\n')

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const ctx = await browser.newContext({
  viewport: { width: 420, height: 900 }, locale: 'pt-BR',
  permissions: ['geolocation'], geolocation: HOME,
})
await ctx.addInitScript(() => { try { localStorage.setItem('eos-ficha-firstrun', '1') } catch {} })
const page = await ctx.newPage()
await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', eu.email)
await page.fill('input[type="password"]', PASS)
await page.locator('button').last().click()
await page.waitForURL(/dashboard|ficha|onboarding/, { timeout: 30000 }).catch(() => {})
await page.goto(`${B}/dashboard`, { waitUntil: 'networkidle' })
await page.locator('.wv2-map canvas').waitFor({ timeout: 30000 })
await page.waitForTimeout(8000)

const pinos = await page.locator('.w-mapmarker.real, .w-selfpuck').count()
pinos > 0
  ? ok('o mapa desenhou pino de pessoa', `${pinos} pino(s)`)
  : no('nenhum pino de pessoa no mapa', 'sem isto o resto não pode ser medido')

if (pinos > 0) {
  // Carimba os nós atuais. Se algum for recriado, o carimbo some com o antigo.
  await page.evaluate(() => {
    document.querySelectorAll('.w-mapmarker.real, .w-selfpuck').forEach((el, i) => {
      el.setAttribute('data-carimbo', String(i))
    })
    // Guarda também o src das fotos: trocar o src rebusca a imagem, que é o
    // piscar mesmo quando o nó sobrevive.
    window.__srcs = Array.from(document.querySelectorAll('.w-mapmarker.real img, .w-selfpuck img')).map(i => i.src)
  })

  // Duas rodadas do ciclo de atualização da família (15 s cada).
  await page.waitForTimeout(36000)

  const depois = await page.evaluate(() => {
    const nos = Array.from(document.querySelectorAll('.w-mapmarker.real, .w-selfpuck'))
    const srcsAgora = Array.from(document.querySelectorAll('.w-mapmarker.real img, .w-selfpuck img')).map(i => i.src)
    const antes = window.__srcs ?? []
    return {
      total: nos.length,
      carimbados: nos.filter(el => el.hasAttribute('data-carimbo')).length,
      fotosIguais: srcsAgora.length === antes.length && srcsAgora.every((s, i) => s === antes[i]),
      fotos: srcsAgora.length,
    }
  })

  depois.total > 0 && depois.carimbados === depois.total
    ? ok('os pinos sobreviveram a duas atualizações', `${depois.carimbados}/${depois.total} nós preservados`)
    : no('pinos recriados — é isso que pisca', `preservados=${depois.carimbados} de ${depois.total}`)

  // Sem foto no DOM não há o que medir — e isso é FALHA do teste, não sucesso.
  if (!depois.fotos) {
    no('nenhuma foto no mapa: a checagem de URL não pôde medir nada', 'o avatar de teste não chegou ao marcador')
  } else if (depois.fotosIguais) {
    ok('a URL da foto não muda entre atualizações', `${depois.fotos} foto(s)`)
  } else {
    no('URL assinada trocou e o navegador rebaixa a imagem', `fotos=${depois.fotos}`)
  }
}

await browser.close()
stopServer()
for (const u of [eu, outra]) {
  await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
  await admin(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'DELETE' })
}
await admin(`/rest/v1/circles?id=eq.${circle[0].id}`, { method: 'DELETE' })

console.log(`\n${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
