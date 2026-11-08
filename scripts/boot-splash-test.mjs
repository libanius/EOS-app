#!/usr/bin/env node
/**
 * BRAND-T02 / D-237 — teste da abertura e da versão no rodapé.
 *
 *   BASE_URL=http://localhost:3000 node scripts/boot-splash-test.mjs
 *
 * Abre o app num Chrome headless e confere:
 *  1. a abertura aparece na entrada e o O está GIRANDO (rotação no plano,
 *     sem deformar — matriz de rotação pura, escala 1);
 *  2. ela termina com o O em 0°, o E e o S visíveis, e some sozinha;
 *  3. não repete na mesma sessão;
 *  4. não aparece nas telas públicas (legais, ficha, Sinal compartilhado);
 *  5. com movimento reduzido não há giro;
 *  6. o rodapé mostra "EOS v<versão do package.json>";
 *  7. nenhum erro de hidratação no console.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const ENTRY = process.env.ENTRY_PATH || '/auth/login'
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const executablePath = process.env.CHROME_PATH || undefined

let fails = 0
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++ }

const browser = await chromium.launch({ executablePath })
const errors = []

function watch(page) {
  page.on('console', m => {
    if (m.type() === 'error' && /hydrat|did not match|Minified React error #4(18|19|22|23|25)/i.test(m.text())) errors.push(m.text())
  })
  page.on('pageerror', e => { if (/hydrat|#4(18|19|22|23|25)/i.test(String(e))) errors.push(String(e)) })
}

const state = page => page.evaluate(() => {
  const el = document.getElementById('eos-boot')
  if (!el) return { visible: false, angle: null, scale: null, e: 0, s: 0 }
  const o = el.querySelector('.eb-o')
  const m = o ? new DOMMatrix(getComputedStyle(o).transform === 'none' ? undefined : getComputedStyle(o).transform) : null
  const angle = m ? Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI) : null
  const scale = m ? Math.hypot(m.a, m.b) : null
  const op = sel => Number(getComputedStyle(el.querySelector(sel)).opacity)
  return {
    visible: !!el && !el.hidden && getComputedStyle(el).display !== 'none' && Number(getComputedStyle(el).opacity) > 0.01,
    angle, scale, e: op('.eb-e'), s: op('.eb-s'),
  }
})

// 1–3. entrada
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage(); watch(page)
  await page.goto(BASE + ENTRY, { waitUntil: 'commit' })
  await page.waitForSelector('#eos-boot', { state: 'attached' })
  const angles = new Set(); let scaleOk = true; let firstVisible = false
  for (let i = 0; i < 10; i++) {
    const st = await state(page)
    if (i === 0) firstVisible = st.visible
    if (st.visible && st.angle !== null) { angles.add(st.angle); if (Math.abs(st.scale - 1) > 0.01) scaleOk = false }
    await page.waitForTimeout(90)
  }
  check(firstVisible, 'abertura aparece na entrada')
  check(angles.size >= 3, `o O gira (ângulos vistos: ${[...angles].join(', ')})`)
  check(scaleOk, 'giro no plano, sem deformar o O (escala 1)')
  const deadline = Date.now() + 7000
  let last = await state(page), sawReveal = false
  while (last.visible && Date.now() < deadline) {
    if (last.e > 0.95 && last.s > 0.95) { sawReveal = true; check(last.angle === 0, `O parou no centro (${last.angle}°) quando E e S apareceram`) }
    if (sawReveal) break
    await page.waitForTimeout(40); last = await state(page)
  }
  check(sawReveal, 'E e S entram antes de a abertura sumir')
  await page.waitForFunction(() => document.getElementById('eos-boot')?.hidden, null, { timeout: 7000 }).catch(() => {})
  check(!(await state(page)).visible, 'abertura some sozinha')
  await page.reload({ waitUntil: 'domcontentloaded' })
  check(!(await state(page)).visible, 'não repete na mesma sessão')
  await ctx.close()
}

// 4. telas públicas
for (const path of ['/terms', '/privacy', '/ficha/00000000-0000-0000-0000-000000000000', '/sinais/exemplo/compartilhar']) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage(); watch(page)
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  check(!(await state(page)).visible, `sem abertura em ${path}`)
  await ctx.close()
}

// 5. movimento reduzido
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await ctx.newPage(); watch(page)
  await page.goto(BASE + ENTRY, { waitUntil: 'domcontentloaded' })
  const st = await state(page)
  check(!st.visible || st.angle === 0, 'movimento reduzido: sem giro')
  await page.waitForFunction(() => document.getElementById('eos-boot')?.hidden, null, { timeout: 4000 }).catch(() => {})
  check(!(await state(page)).visible, 'movimento reduzido: some rápido')
  await ctx.close()
}

// 6. versão no rodapé
{
  const ctx = await browser.newContext()
  const page = await ctx.newPage(); watch(page)
  await page.goto(BASE + '/terms', { waitUntil: 'domcontentloaded' })
  const label = await page.locator('[data-testid="app-version"]').first().textContent().catch(() => '')
  check(label?.startsWith(`EOS v${version}`), `rodapé mostra a versão (${label})`)
  await ctx.close()
}

check(errors.length === 0, `sem erro de hidratação${errors.length ? ': ' + errors[0].slice(0, 160) : ''}`)
await browser.close()
console.log(fails ? `\n${fails} falha(s)` : '\ntudo certo')
process.exit(fails ? 1 : 0)
