/**
 * Navegação local da Preparação (PREP-T07 / D-164).
 *
 * Os critérios de aceitação da fase 1 virados em prova de navegador. O que
 * importa aqui não é que a página abre — é que **a barra global não se mexeu**:
 * a promessa de `docs/35` é que sub-rotas de um domínio não custam nada à
 * navegação global, e uma promessa dessas só vale medida.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import { config } from 'dotenv'
import { chromium } from 'playwright'
import { track, cleanupOnExit, finish } from './lib/test-cleanup.mjs'

config({ path: '.env.local' })

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PORT = Number(process.env.PORT || 3061)
const B = `http://localhost:${PORT}`
const PASS = 'EosTest#2026!'

if (!URL_SB || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = (path, options = {}) => fetch(`${URL_SB}${path}`, {
  ...options,
  headers: {
    'Content-Type': 'application/json',
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    Prefer: 'return=representation',
    ...options.headers,
  },
})

cleanupOnExit(admin)

let pass = 0
let fail = 0
const ok = label => { pass += 1; console.log(`✅ ${label}`) }
const no = (label, detail = '') => { fail += 1; console.log(`❌ ${label}${detail ? `: ${detail}` : ''}`) }

if (!fs.existsSync('.next/BUILD_ID')) {
  console.error('Faltou `npm run build`.')
  process.exit(1)
}

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: process.env, stdio: 'ignore' })
const stopServer = () => { try { server.kill('SIGTERM') } catch {} }
process.on('exit', stopServer)

let up = false
for (let i = 0; i < 60 && !up; i += 1) {
  await new Promise(resolve => setTimeout(resolve, 500))
  up = await fetch(`${B}/auth/login`).then(r => r.status < 500).catch(() => false)
}
if (!up) {
  console.error('Servidor não subiu')
  stopServer()
  await finish(1)
}

const email = `eos-prep-${Date.now()}@test.internal`
const created = await admin('/auth/v1/admin/users', {
  method: 'POST',
  body: JSON.stringify({ email, password: PASS, email_confirm: true }),
}).then(r => r.json())
if (!created.id) {
  console.error('Falha criando usuário temporário', created)
  stopServer()
  await finish(1)
}
track.user(created.id)
await admin(`/rest/v1/profiles?id=eq.${created.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ name: 'Prep Test' }),
})

const browser = await chromium.launch({ args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, locale: 'pt-BR' })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('eos-ficha-firstrun', '1')
      localStorage.setItem('eos-water-fema-standard-seen', 'seen')
    } catch {}
  })

  await page.goto(`${B}/auth/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', PASS)
  await page.locator('button').last().click()
  await page.waitForURL(/dashboard|ficha|onboarding|preparedness/, { timeout: 30000 }).catch(() => {})

  // ── 1. A Visão continua sendo a porta ─────────────────────────────────────
  await page.goto(`${B}/preparedness`, { waitUntil: 'networkidle' })
  const navLocal = page.locator('nav[aria-label="Seções da Preparação"]')
  await navLocal.waitFor({ timeout: 20000 })
  ok('/preparedness abre com a navegação local')

  // ── 2. O chip ativo é o da rota atual ─────────────────────────────────────
  const atual = await navLocal.locator('[aria-current="page"]').innerText().catch(() => '')
  atual.trim() === 'Visão'
    ? ok('chip ativo na Visão é "Visão"')
    : no('chip ativo errado na Visão', atual)

  // ── 2b. A faixa GRUDA ao rolar ────────────────────────────────────────────
  // Trocar de seção depois de rolar é o movimento mais comum da tela. Se a
  // faixa sobe junto com o conteúdo, ela existe só para quem está no topo — e
  // aí não é navegação, é enfeite.
  await page.evaluate(() => window.scrollTo(0, 900))
  await page.waitForTimeout(400)
  const caixa = await navLocal.boundingBox()
  const alturaJanela = page.viewportSize()?.height ?? 844
  const grudou = !!caixa && caixa.y >= -1 && caixa.y < alturaJanela / 2
  grudou
    ? ok('a faixa continua visível depois de rolar')
    : no('a faixa sobe junto com o conteúdo', caixa ? `y=${Math.round(caixa.y)}` : 'fora da tela')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(200)

  // Mesma checagem numa janela larga. `position: sticky` quebra quando algum
  // ancestral tem `overflow` e NÃO é o elemento que realmente rola — e qual
  // elemento rola pode mudar com a largura.
  await page.setViewportSize({ width: 800, height: 1000 })
  await page.reload({ waitUntil: 'networkidle' })
  await navLocal.waitFor({ timeout: 20000 })
  const rolou = await page.evaluate(() => {
    window.scrollTo(0, 900)
    const doc = document.scrollingElement
    return { janela: window.scrollY, doc: doc ? doc.scrollTop : -1 }
  })
  await page.waitForTimeout(400)
  const caixaLarga = await navLocal.boundingBox()
  const grudouLargo = !!caixaLarga && caixaLarga.y >= -1 && caixaLarga.y < 500
  grudouLargo
    ? ok('a faixa gruda também em janela larga')
    : no('a faixa NÃO gruda em janela larga', `y=${caixaLarga ? Math.round(caixaLarga.y) : 'null'} scrollY=${rolou.janela}`)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'networkidle' })
  await navLocal.waitFor({ timeout: 20000 })

  // ── 3. O chip navega de verdade (rota, não estado em memória) ─────────────
  await navLocal.locator('a', { hasText: 'O que falta' }).click()
  await page.waitForURL(/\/preparedness\/o-que-falta/, { timeout: 10000 }).catch(() => {})
  const foiParaSubtopico = page.url().includes('/preparedness/o-que-falta')
  foiParaSubtopico
    ? ok('chip navega para /preparedness/o-que-falta')
    : no('chip não navegou', page.url())

  // ── 4. O CRITÉRIO QUE MAIS IMPORTA ────────────────────────────────────────
  // A barra global não muda em sub-rota, e PREPARAÇÃO segue acesa. É a
  // propriedade que `docs/35` pediu para preservar: sub-rota de domínio não
  // custa nada à navegação global.
  const itensGlobais = await page.locator('nav.nav a').count()
  itensGlobais === 5
    ? ok('BottomNav continua com 5 destinos na sub-rota')
    : no('BottomNav mudou de tamanho na sub-rota', String(itensGlobais))

  const prepAceso = await page.locator('nav.nav a[aria-current="page"]').innerText().catch(() => '')
  prepAceso.trim() === 'Preparação'
    ? ok('PREPARAÇÃO segue acesa na sub-rota')
    : no('PREPARAÇÃO apagou na sub-rota', prepAceso)

  // ── 5. Voltar devolve à Visão, não ao domínio anterior ────────────────────
  await page.goBack()
  await page.waitForURL(/\/preparedness$/, { timeout: 10000 }).catch(() => {})
  const voltouParaVisao = new URL(page.url()).pathname === '/preparedness'
  voltouParaVisao
    ? ok('voltar do subtópico devolve à Visão')
    : no('voltar não devolveu à Visão', page.url())

  // ── 5b. O terceiro chip e o endereço antigo do estoque ────────────────────
  await page.goto(`${B}/preparedness`, { waitUntil: 'networkidle' })
  await navLocal.waitFor({ timeout: 20000 })
  const chips = await navLocal.locator('a').count()
  chips === 5
    ? ok('a faixa tem os 5 destinos')
    : no('a faixa não tem 5 destinos', String(chips))

  await navLocal.locator('a', { hasText: 'O que tenho' }).click()
  await page.waitForURL(/\/preparedness\/o-que-tenho/, { timeout: 10000 }).catch(() => {})
  const foiParaEstoque = page.url().includes('/preparedness/o-que-tenho')
  foiParaEstoque
    ? ok('chip navega para /preparedness/o-que-tenho')
    : no('chip do estoque não navegou', page.url())

  await page.goto(`${B}/inventory`, { waitUntil: 'networkidle' })
  const redirEstoque = page.url().includes('/preparedness/o-que-tenho')
  redirEstoque
    ? ok('/inventory redireciona para o estoque')
    : no('/inventory não redirecionou', page.url())

  // ── 5c. A Visão não edita nada ────────────────────────────────────────────
  // É o ponto da fase 2: tela de decisão, não de manutenção. Um stepper aqui
  // significa que um editor voltou a vazar para a Visão.
  await page.goto(`${B}/preparedness`, { waitUntil: 'networkidle' })
  await navLocal.waitFor({ timeout: 20000 })
  const steppers = await page.locator('main input[inputmode], [role="switch"]').count()
  steppers === 0
    ? ok('a Visão não tem nenhum editor')
    : no('a Visão voltou a ter editor', String(steppers))

  // ── 5d. Plano e Aprender viraram subtópicos (NAV-T04) ─────────────────────
  // Eram as duas coisas mais escondidas do app: 1409 linhas atrás de um
  // hambúrguer, e um RAG inteiro com uma porta só.
  for (const [rota, chip] of [['/plan', 'Plano'], ['/edu', 'Aprender']]) {
    await page.goto(`${B}${rota}`, { waitUntil: 'networkidle' })
    const destino = chip === 'Plano' ? '/preparedness/plano' : '/preparedness/aprender'
    const foi = page.url().includes(destino)
    foi ? ok(`${rota} redireciona para ${destino}`) : no(`${rota} não redirecionou`, page.url())

    const aceso = await page.locator('nav[aria-label="Seções da Preparação"] [aria-current="page"]').innerText().catch(() => '')
    aceso.trim() === chip
      ? ok(`${chip} acende o próprio chip`)
      : no(`${chip} não acendeu`, aceso)
  }

  // ── 5e. O Plano está na faixa, e não escondido ────────────────────────────
  // Era um item de menu sem rótulo (NAV-T04); o menu inteiro morreu em NAV-T06,
  // e o que a checagem mede agora é o destino que ficou no lugar dele.
  await page.goto(`${B}/preparedness`, { waitUntil: 'networkidle' })
  const chipsPlano = await page.locator('nav[aria-label="Seções da Preparação"] a', { hasText: 'Plano' }).count()
  chipsPlano === 1
    ? ok('o Plano é chip da Preparação, não item de menu')
    : no('o Plano não está na faixa', String(chipsPlano))

  // ── 5f. Família ganhou seções (NAV-T05) ───────────────────────────────────
  await page.goto(`${B}/family`, { waitUntil: 'networkidle' })
  const navFamilia = page.locator('nav[aria-label="Seções da Família"]')
  await navFamilia.waitFor({ timeout: 20000 })
  const chipsFam = await navFamilia.locator('a').count()
  chipsFam === 4
    ? ok('a faixa de Família tem os 4 destinos')
    : no('faixa de Família com contagem errada', String(chipsFam))

  for (const [rota, destino, chip] of [
    ['/ficha', '/family/ficha', 'Ficha'],
    ['/circles', '/family/circulos', 'Círculos'],
  ]) {
    await page.goto(`${B}${rota}`, { waitUntil: 'networkidle' })
    page.url().includes(destino)
      ? ok(`${rota} redireciona para ${destino}`)
      : no(`${rota} não redirecionou`, page.url())

    const aceso = await page.locator('nav[aria-label="Seções da Família"] [aria-current="page"]').innerText().catch(() => '')
    aceso.trim() === chip ? ok(`${chip} acende o próprio chip`) : no(`${chip} não acendeu`, aceso)
  }

  // ── 5g. O QR PÚBLICO não pode ter mudado de endereço ──────────────────────
  // Ele está impresso, colado em geladeira e compartilhado. Mexer nele
  // quebraria o papel de quem já imprimiu.
  // Com o id REAL do usuário temporário: `notFound()` para id inexistente é
  // comportamento correto da página, e testar com uuid falso mediria a coisa
  // errada — foi o que eu fiz na primeira versão desta checagem.
  const qr = await page.goto(`${B}/ficha/${created.id}`, { waitUntil: 'domcontentloaded' })
  const qrStatus = qr?.status() ?? 0
  const qrRedirecionou = page.url().includes('/family/')
  qrStatus !== 404 && !qrRedirecionou
    ? ok('o QR público /ficha/[id] continua no mesmo endereço')
    : no('o QR público mudou ou sumiu', `${qrStatus} · ${page.url()}`)

  // ── 5h. O ☰ deixou de existir (NAV-T06 / D-180) ───────────────────────────
  // Configurações era a última coisa dentro dele e virou o destino MAIS na
  // barra global. Duas navegações concorrentes, com a segunda invisível, eram
  // uma a mais.
  await page.goto(`${B}/preparedness`, { waitUntil: 'networkidle' })
  const menuMorto = await page.locator('.app-actions-trigger').count()
  menuMorto === 0
    ? ok('o ☰ deixou de existir')
    : no('o ☰ continua na tela', String(menuMorto))

  const chipMais = await page.locator('nav.nav a', { hasText: 'Mais' }).count()
  chipMais === 1
    ? ok('MAIS é destino da barra global')
    : no('MAIS não está na barra', String(chipMais))

  await page.goto(`${B}/settings`, { waitUntil: 'networkidle' })
  page.url().includes('/mais')
    ? ok('/settings redireciona para /mais')
    : no('/settings não redirecionou', page.url())

  // O Treino chegou aqui vindo de um slot da barra; ele não pode ter sumido no
  // caminho. Em NAV-T08 ele ganhou endereço próprio, `/mais/treino`.
  const treino = await page.locator('a[href="/mais/treino"]').count()
  treino >= 1
    ? ok('o Treino tem porta em /mais')
    : no('o Treino sumiu de /mais', String(treino))

  /*
   * ── 5i. O ESTOQUE SALVA DE VERDADE (PREP-T16 / D-185) ────────────────────
   *
   * A checagem que faltava e custou um dia inteiro: nenhum teste jamais
   * ESCREVEU nesta tela. `test:prep-nav` provava que ela abre, que o chip
   * acende e que a Visão não tem editor — tudo sobre navegação, nada sobre
   * gravar.
   *
   * De 2026-08-13 até aqui, o editor mandava PUT para uma rota que só tem GET
   * e POST. O Next devolvia 405 e a tela dizia "Erro ao salvar", sem número,
   * sem log, sem nada do outro lado.
   *
   * Este teste toca o "+" da água, espera o debounce, RECARREGA e confere que
   * o número voltou diferente. Recarregar é o ponto: sem isso ele mediria só o
   * estado em memória, que muda mesmo quando a gravação falha.
   */
  // O `NumericStepper` só vira `<input>` quando a pessoa toca no número; em
  // repouso o valor é um `<span>` arrastável. Ler o span é o que o olho lê.
  const valorAgua = async () => {
    await page.locator('button[aria-label="Aumentar"]').first().waitFor({ timeout: 20000 })
    const txt = await page.locator('button[aria-label="Diminuir"]').first()
      .evaluate(el => el.parentElement?.querySelector('span')?.textContent ?? '')
    return Number(String(txt).replace(',', '.'))
  }

  await page.goto(`${B}/preparedness/o-que-tenho`, { waitUntil: 'networkidle' })
  const antes = await valorAgua()

  await page.locator('button[aria-label="Aumentar"]').first().click()
  // 600ms de debounce + a ida ao servidor.
  await page.waitForTimeout(2500)

  const erroVisivel = await page.getByText(/Erro ao salvar/i).count()
  erroVisivel === 0
    ? ok('o estoque não mostra erro ao salvar')
    : no('o estoque mostrou "Erro ao salvar"')

  await page.reload({ waitUntil: 'networkidle' })
  const depois = await valorAgua()
  depois > antes
    ? ok(`a água PERSISTE depois de recarregar: ${antes} → ${depois}`)
    : no('a água não persistiu — a gravação falhou', `${antes} → ${depois}`)

  // ── 6. O endereço antigo não vira 404 ─────────────────────────────────────
  await page.goto(`${B}/checklist`, { waitUntil: 'networkidle' })
  const redirecionou = page.url().includes('/preparedness/o-que-falta')
  redirecionou
    ? ok('/checklist redireciona para o subtópico')
    : no('/checklist não redirecionou', page.url())

  // ── 7. Deep link direto funciona sem passar pela Visão ────────────────────
  await page.goto(`${B}/preparedness/o-que-falta`, { waitUntil: 'networkidle' })
  const navDireta = await page.locator('nav[aria-label="Seções da Preparação"] [aria-current="page"]').innerText().catch(() => '')
  navDireta.includes('falta')
    ? ok('deep link direto acende o chip certo')
    : no('deep link não acendeu o chip certo', navDireta)

  // ── 8. Semântica: navegação, não abas ─────────────────────────────────────
  // Sem painéis em memória, um `tablist` mentiria para o leitor de tela.
  const abasFalsas = await page.locator('nav[aria-label="Seções da Preparação"] [role="tab"]').count()
  abasFalsas === 0
    ? ok('a faixa usa navegação, não role="tab"')
    : no('a faixa está fingindo ser tablist', String(abasFalsas))
} catch (error) {
  no('erro inesperado', error.message)
} finally {
  await browser.close().catch(() => {})
  stopServer()
}

console.log(`\n${pass} passou · ${fail} falhou`)
await finish(fail ? 1 : 0)
