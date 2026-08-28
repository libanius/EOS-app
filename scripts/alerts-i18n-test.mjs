/**
 * A tela de Alertas fala UM idioma de cada vez (leva 1 da coerência).
 *
 * Antes desta tarefa ela falava os dois ao mesmo tempo, dentro da mesma carta:
 * "Weather Intelligence" e "Allow location access" em inglês, "Salvar no Kit" e
 * "Fonte oficial" em português, atividades vindas em inglês de
 * `lib/weather/engine.ts` e kits em português de `lib/checklist.ts`. E servia
 * °F, mph e milhas para quem tinha escolhido português.
 *
 * O que este teste prova, num navegador de verdade, contra a tela real:
 *
 *   1. em inglês NÃO sobra palavra portuguesa na tela
 *   2. em português NÃO sobra palavra inglesa na tela
 *   3. em inglês as unidades são imperiais (°F / mph / mi)
 *   4. em português as unidades são métricas (°C / km/h / km) — nenhuma imperial
 *   5. o relógio segue o idioma: 12 h com AM/PM em inglês, 24 h em português
 *   6. controle negativo: as sondas ACHAM o que procuram quando ele existe,
 *      senão os itens 1 e 2 passariam num texto vazio
 *
 * ATENÇÃO: cria e apaga uma conta no Supabase de produção.
 */
import fs from 'node:fs'
import { config } from 'dotenv'
import { chromium } from 'playwright'
import { track, cleanupOnExit } from './lib/test-cleanup.mjs'

config({ path: '.env.local' })

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SHOT = process.env.SHOT_DIR || '/tmp/eos-alerts-i18n'

const EMAIL = `eos-i18n-${Date.now()}@test.internal`
const PASS = 'EosTest#2026!'
const LAT = 25.7617
const LNG = -80.1918

const admin = (path, opts = {}) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json', apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=representation', ...opts.headers,
    },
  })

cleanupOnExit(admin)

let pass = 0, fail = 0
const ok = (l, d = '') => { pass++; console.log(`✅ ${l}${d ? ': ' + d : ''}`) }
const no = (l, d = '') => { fail++; console.log(`❌ ${l}${d ? ': ' + d : ''}`) }

// Palavras que só existem num dos idiomas. Evito de propósito termos que são
// iguais nos dois (Checklist, GPS, Radar) e nomes próprios das fontes (NWS,
// NHC) — eles aparecem legitimamente em qualquer idioma.
// A primeira versão desta lista só continha palavras da própria AlertsPage, e
// por isso deu 9/9 numa tela que ainda exibia "Multi-source hazard monitoring"
// e "3 to configure" em português — o cartão da Live Intelligence Network é
// outro componente, e a sonda não olhava para ele. Uma lista de sondas escrita
// a partir do que se lembra de ter traduzido mede a memória do autor, não a
// tela. As últimas seis de cada lista vêm da LIN.
const PT_ONLY = ['Atualizar', 'Carregando', 'Umidade', 'Rajadas', 'Visibilidade',
                 'Nuvens', 'Salvar', 'Cancelar', 'Escolha', 'Fonte oficial',
                 'Qualidade do ar', 'Sensação', 'Próximas', 'Previsão de',
                 'Monitoramento de perigo', 'Último sinal', 'a configurar',
                 'ao vivo', 'RESERVA', 'atrás']
const EN_ONLY = ['Refresh', 'Loading', 'Humidity', 'Gusts', 'Visibility',
                 'Cloud', 'Save', 'Cancel', 'Choose', 'Official source',
                 'Air quality', 'Feels like', 'Next 12', '3-day',
                 'Multi-source', 'Last signal', 'to configure',
                 'live', 'BACKUP', 'sec ago']
// 'ago' saiu da lista: em português é a abreviação de AGOSTO ("sáb., 29 de
// ago.") e mora dentro de "AGORA". Uma sonda ambígua no idioma que ela vigia
// não mede coerência, mede coincidência.

/**
 * Ir para uma rota e CONFERIR que se chegou nela.
 *
 * O EOS desvia o primeiro acesso de ficha incompleta para `/ficha`, uma vez só
 * (onboarding, 2026-07-22). Um `goto` ingênuo obedece ao desvio e o script segue
 * fotografando a tela errada sem reclamar — foi assim que a captura da Play
 * Store trouxe a Ficha Master no lugar do mapa, e este teste mediu uma tela que
 * não era a de Alertas. Como o desvio acontece UMA vez, a segunda navegação
 * chega. Se ainda assim não chegar, é para falhar alto, não seguir em silêncio.
 */
async function gotoOrFail(page, base, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  if (!page.url().includes(path)) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  }
  if (!page.url().includes(path)) {
    throw new Error(`nao cheguei em ${path} — parei em ${page.url()}`)
  }
}

/**
 * Casar por PALAVRA, não por trecho.
 *
 * `texto.includes('ago')` acusou inglês vazando no português porque "ago" mora
 * dentro de "AGORA" — o cartão de chuva se chama "CHUVA AGORA". Uma sonda que
 * casa no meio de palavra inventa defeito, e uma que inventa defeito é tão
 * inútil quanto a que não acha nenhum: nos dois casos o resultado deixa de ser
 * lido. `\\b` do JS não entende acento, então as bordas são checadas à mão
 * contra a classe de letras que o português usa de fato.
 */
function hasWord(text, word) {
  const letra = "A-Za-zÀ-ÖØ-öø-ÿ0-9"
  const re = new RegExp(`(^|[^${letra}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^${letra}]|$)`, 'i')
  return re.test(text)
}

async function main() {
  fs.mkdirSync(SHOT, { recursive: true })

  const created = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASS, email_confirm: true }),
  }).then(r => r.json())
  const uid = created.id
  if (!uid) throw new Error('falha ao criar conta: ' + JSON.stringify(created).slice(0, 200))
  track.user(uid)
  await admin(`/rest/v1/profiles?id=eq.${uid}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: 'i18n', location_lat: LAT, location_lng: LNG }),
  })

  const browser = await chromium.launch()

  async function render(lang) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 900 },
      deviceScaleFactor: 2,
      permissions: ['geolocation'],
      geolocation: { latitude: LAT, longitude: LNG },
      locale: lang === 'pt' ? 'pt-BR' : 'en-US',
    })
    // A escolha de idioma mora em localStorage; plantá-la antes do primeiro
    // paint testa o mesmo caminho que a pessoa usa em Mais → Idioma.
    await ctx.addInitScript(l => window.localStorage.setItem('eos-language', l), lang)
    const page = await ctx.newPage()
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' })
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASS)
    await page.locator('button').last().click()
    await page.waitForURL(/dashboard|ficha|onboarding/, { timeout: 25000 }).catch(() => {})
    await gotoOrFail(page, BASE, '/dashboard/alertas')
    await page.waitForTimeout(9000)
    await page.screenshot({ path: `${SHOT}/alertas-${lang}.png`, fullPage: true })
    const text = await page.locator('body').innerText()
    await ctx.close()
    return text
  }

  const en = await render('en')
  const pt = await render('pt')
  await browser.close()

  // ── 6. controle negativo primeiro: as sondas funcionam? ──────────────────
  const enFound = EN_ONLY.filter(w => hasWord(en, w))
  const ptFound = PT_ONLY.filter(w => hasWord(pt, w))
  enFound.length >= 3
    ? ok('controle negativo: as sondas EN acham o que procuram', `${enFound.length}/${EN_ONLY.length}`)
    : no('as sondas EN não acharam nada — os testes 1-2 não valem', `${enFound.length}`)
  ptFound.length >= 3
    ? ok('controle negativo: as sondas PT acham o que procuram', `${ptFound.length}/${PT_ONLY.length}`)
    : no('as sondas PT não acharam nada — os testes 1-2 não valem', `${ptFound.length}`)

  // ── 1 e 2. um idioma de cada vez ─────────────────────────────────────────
  const ptInEn = PT_ONLY.filter(w => hasWord(en, w))
  ptInEn.length === 0
    ? ok('em inglês não sobra palavra portuguesa')
    : no('português vazando na tela em inglês', ptInEn.join(', '))

  const enInPt = EN_ONLY.filter(w => hasWord(pt, w))
  enInPt.length === 0
    ? ok('em português não sobra palavra inglesa')
    : no('inglês vazando na tela em português', enInPt.join(', '))

  // ── 3 e 4. unidades ──────────────────────────────────────────────────────
  const enImperial = /(°F|\bmph\b|\bmi\b)/.test(en)
  enImperial
    ? ok('inglês usa unidade imperial')
    : no('inglês perdeu a unidade imperial')

  const imperialInPt = pt.match(/°F|\bmph\b|\d\s?mi\b/g)
  !imperialInPt
    ? ok('português NÃO tem nenhuma unidade imperial')
    : no('imperial vazando no português', [...new Set(imperialInPt)].join(', '))

  const ptMetric = /(°C|km\/h|\bkm\b)/.test(pt)
  ptMetric
    ? ok('português usa unidade métrica')
    : no('português não mostrou nenhuma unidade métrica')

  // ── 5. relógio ───────────────────────────────────────────────────────────
  const en12h = /\d{1,2}:\d{2}\s?(AM|PM)/.test(en)
  en12h
    ? ok('inglês usa relógio de 12 h com AM/PM')
    : no('inglês perdeu o relógio de 12 h')

  const ptHasMeridiem = /(AM|PM)\b/.test(pt)
  !ptHasMeridiem
    ? ok('português não tem AM/PM')
    : no('AM/PM vazando no português')

  console.log(`\n${pass} passaram, ${fail} falharam`)
  console.log(`capturas em ${SHOT}`)
  process.exitCode = fail > 0 ? 1 : 0
}

main().catch(e => { console.error('❌', e.message); process.exitCode = 1 })
