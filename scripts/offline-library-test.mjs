/** No production account or credentials: test persisted library with all network calls blocked after load. */
import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const url = process.env.OFFLINE_TEST_ORIGIN || 'http://localhost:8877'
const rows = process.env.OFFLINE_TEST_CORPUS ? JSON.parse(readFileSync(process.env.OFFLINE_TEST_CORPUS, 'utf8')) : [
  { id: 'military', source: 'Military Survival', chunk_index: 0, content: 'Water treatment. Keep warnings with procedures. Do not assume filters remove chemicals.' },
  { id: 'psych', source: 'Psychological First Aid', chunk_index: 0, content: 'Stress and fear. Offer calm practical support.' },
]
const documents = rows.map(r => ({ id: 'manual:' + r.id, kind: 'manual', lang: 'en', source: r.source,
  title: `${r.source} · ${r.chunk_index + 1}`, text: r.content, version: r.source_version || 'imported' }))
documents.push({ id: 'signal:new', kind: 'signal', lang: 'pt', source: 'EOS Sinais', version: 'v2', title: 'Novo sinal de água', text: 'VERSÃO NOVA PUBLICADA. O que é. O que não é. Alternativas para água.' },
  { id: 'edu:new', kind: 'edu', lang: 'pt', source: 'EOS EDU', version: 'v3', title: 'Aula nova sobre abrigo', text: 'CORPO COMPLETO APROVADO: montar abrigo.', href: '/preparedness/aprender?contentId=new' })
const pack = { schema: 1, documents, syncedAt: '2026-11-10T14:00:00Z', version: createHash('sha256').update(JSON.stringify(documents)).digest('hex') }
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH })
try {
  for (const native of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    if (native) {
      await context.addInitScript(({ pack }) => {
        const raw = JSON.stringify(pack), key = 'eos.offline.knowledge.v1'
        const store = { [key]: JSON.stringify({ version: pack.version, blocks: 1 }), [key + ':' + pack.version + ':0']: raw }
        window.Capacitor = { Plugins: { Preferences: { get: async ({ key }) => ({ value: store[key] || null }) } } }
      }, { pack })
    }
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(url + '/offline.html')
    if (!native) {
      await page.evaluate(async pack => {
        await new Promise((resolve, reject) => {
          const req = indexedDB.open('eos', 1)
          req.onupgradeneeded = () => req.result.createObjectStore('kv')
          req.onerror = () => reject(req.error)
          req.onsuccess = () => {
            const db = req.result, tx = db.transaction('kv', 'readwrite')
            tx.objectStore('kv').put(pack, 'knowledge:pack')
            tx.oncomplete = () => { db.close(); resolve() }
          }
        })
      }, pack)
      await page.reload()
    }
    await page.locator('#knowledge-status').filter({ hasText: '2026' }).waitFor()
    await context.setOffline(true)
    await page.selectOption('#knowledge-language', 'pt')
    for (const word of ['água', 'estresse', 'abrigo']) {
      await page.fill('#knowledge-query', word)
      await page.locator('#knowledge-search').click()
      const first = page.locator('#knowledge-results > article').first()
      await first.waitFor()
      if (!(await first.innerText()).includes('Fonte:')) throw new Error('Missing source: ' + word)
    }
    await page.locator('#knowledge-results > article details > summary').first().click()
    if (!(await page.locator('#knowledge-results > article').first().innerText()).includes('CORPO COMPLETO APROVADO')) throw new Error('Full EDU body unavailable')
    await page.screenshot({ path: '/tmp/eos-offline-' + (native ? 'native' : 'web') + '.png' })
    await page.fill('#knowledge-query', 'xyzunrelated')
    await page.locator('#knowledge-search').click()
    if (!(await page.locator('#knowledge-results').innerText()).includes('Nenhum trecho')) throw new Error('False match')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    if (overflow || errors.length) throw new Error(JSON.stringify({ overflow, errors }))
    console.log((native ? 'Native store simulation' : 'IndexedDB') + ': offline search, full text, source, empty result and 390px layout passed')
    await context.close()
  }
} finally { await browser.close() }
