/**
 * STORE-T02 / D-231 — a vitrine não promete o que o código não entrega.
 *
 * Com o Stripe em LIVE, um item de plano sem entrega é cobrança por coisa
 * inexistente, e é motivo de rejeição na revisão da loja (2.3 / 3.1). Este
 * teste lê a fonte da landing e do `/mais` porque a promessa mora na copy, não
 * em comportamento: nenhum teste de rota pegaria uma frase.
 *
 * Quando um destes recursos for entregue de verdade, a correção é tirar o
 * "em breve" E remover a palavra da lista abaixo — no mesmo commit da entrega.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

// Recursos sem entrega em 2026-11-01 (D-226 e auditoria D-231).
const UNDELIVERED = /CDC|FDA|PDF|30[- ]?(dias|day)|histórico|history|incêndio|fire|FEMA/i
const SOON = /^(Em breve|Coming soon):/

describe('landing: itens de plano', () => {
  const src = read('app/page.tsx')
  const items = Array.from(src.matchAll(/items: \[([^\]]+)\]/g))
    .flatMap(m => Array.from(m[1].matchAll(/'([^']+)'/g)).map(x => x[1]))

  it('encontra os itens (o teste não passa por estar cego)', () => {
    expect(items.length).toBeGreaterThan(10)
  })

  it.each(items.filter(i => UNDELIVERED.test(i)))('"%s" vem marcado como em breve', item => {
    expect(item).toMatch(SOON)
  })

  it('não diz que dado nenhum é compartilhado', () => {
    expect(src).not.toMatch(/não são compartilhados|is not shared/)
  })
})

describe('/mais: linhas de plano', () => {
  const src = read('app/(app)/mais/page.tsx')
  const rows = Array.from(src.matchAll(/\{ key: 'settings\.planFeatures\.([a-z_]+)', requiredPlan: '([a-z]+)'(, soon: true)? \}/g))

  it('encontra as linhas', () => {
    expect(rows.length).toBeGreaterThan(10)
  })

  it.each(['monitoring_cdc', 'monitoring_fda', 'monitoring_history', 'exportar_ficha', 'monitoring_fire', 'monitoring_fema'])(
    '%s está marcado como em breve',
    key => {
      const row = rows.find(r => r[1] === key)
      expect(row?.[3]).toBe(', soon: true')
    },
  )

  it('push é gratuito (D-220), não benefício de plano pago', () => {
    expect(rows.find(r => r[1] === 'monitoring_push')?.[2]).toBe('free')
  })
})
