/**
 * A faixa de repouso nunca pode tranquilizar sem base (D-128).
 *
 * É a única linha que a maioria das sessões vai ler. Metade destes casos existe
 * para provar que ela **não** diz "estável" quando a casa está vazia — num app
 * de emergência, o erro caro é o otimista, e este é o lugar onde ele custa mais.
 */

import { restingVerdict } from '@/components/world-v2/resting-verdict'

const base = {
  riskState: 'safe',
  score: 14,
  stateLabel: 'Estável',
  autonomyDays: 7,
  checklistPct: 80,
  alertCount: 0,
  pt: true,
}

describe('a casa ganha quando está pior', () => {
  it('dia bonito, despensa vazia: a faixa fala da despensa', () => {
    // O caso exato da captura do dono: 14 · Estável em verde, com 0 dias.
    const v = restingVerdict({ ...base, autonomyDays: 0, checklistPct: 0 })
    expect(v.source).toBe('household')
    expect(v.severity).toBe('critical')
    expect(v.line).toMatch(/reabasteça hoje/)
    expect(v.lead).toBe('0.0')
  })

  it('menos de um dia é crítico, sem discussão', () => {
    expect(restingVerdict({ ...base, autonomyDays: 0.9 }).severity).toBe('critical')
  })

  it('abaixo de três dias é aviso', () => {
    const v = restingVerdict({ ...base, autonomyDays: 2 })
    expect(v.severity).toBe('warning')
    expect(v.line).toMatch(/abaixo do mínimo/)
  })

  it('autonomia não medida NÃO vale seguro', () => {
    // Uma leitura que falhou não pode virar tranquilização.
    const v = restingVerdict({ ...base, autonomyDays: null })
    expect(v.severity).toBe('watch')
    expect(v.source).toBe('household')
    expect(v.line).toMatch(/não medida/)
  })

  it('empate vai para a casa: o clima já tem uma aba inteira', () => {
    const v = restingVerdict({ ...base, riskState: 'watch', autonomyDays: 10, checklistPct: 20 })
    expect(v.source).toBe('household')
  })
})

describe('o clima ganha quando está pior', () => {
  it('tempestade com a casa pronta: a faixa fala da tempestade', () => {
    const v = restingVerdict({ ...base, riskState: 'critical', score: 82, stateLabel: 'Crítico', alertCount: 2 })
    expect(v.source).toBe('weather')
    expect(v.severity).toBe('critical')
    expect(v.lead).toBe('82')
    expect(v.line).toMatch(/2 alertas ativos/)
  })

  it('casa em ordem e tempo bom: a faixa volta a ser do clima', () => {
    const v = restingVerdict(base)
    expect(v.source).toBe('weather')
    expect(v.severity).toBe('safe')
  })

  it('um alerta no singular', () => {
    const v = restingVerdict({ ...base, riskState: 'warning', alertCount: 1 })
    expect(v.line).toMatch(/1 alerta ativo/)
  })
})

describe('todo número tem alça', () => {
  it('a faixa da casa leva para Preparação; a do clima, para Clima', () => {
    expect(restingVerdict({ ...base, autonomyDays: 0 }).href).toBe('/preparedness')
    expect(restingVerdict(base).href).toBe('/weather')
  })

  it('nunca devolve destino vazio', () => {
    const casos = [
      { autonomyDays: 0 }, { autonomyDays: null }, { autonomyDays: 2 },
      { riskState: 'critical' }, { checklistPct: 10 }, {},
    ]
    for (const c of casos) expect(restingVerdict({ ...base, ...c }).href).toMatch(/^\//)
  })
})

describe('o texto sai legível quando colado ao número', () => {
  /*
   * A faixa renderiza `lead` e `line` colados. Na primeira versão saiu
   * "0.0dias de autonomia" — dois de três textos tinham o espaço e um não.
   * O olho pega isso na captura; o teste pega antes.
   */
  it('toda linha da casa começa com separador', () => {
    for (const dias of [0, 0.5, 2, 2.9, 5, 30]) {
      const v = restingVerdict({ ...base, autonomyDays: dias, checklistPct: 10 })
      if (v.source !== 'household') continue
      expect(`${v.lead}${v.line}`).not.toMatch(/\d[a-záéíóúâêôãõç]/i)
    }
  })
})

describe('a severidade nunca é otimista', () => {
  it('piorar a casa nunca melhora o veredito', () => {
    let anterior = 0
    const rank = { safe: 0, watch: 1, warning: 2, critical: 3 } as const
    for (const dias of [30, 10, 5, 3, 2.5, 1, 0.5, 0]) {
      const s = restingVerdict({ ...base, autonomyDays: dias }).severity
      expect(rank[s]).toBeGreaterThanOrEqual(anterior)
      anterior = rank[s]
    }
  })
})

describe('a faixa em repouso cabe numa linha (D-131)', () => {
  /*
   * A faixa é UMA linha de ~390px dividida entre o número grande, este texto e
   * o botão. O navegador não avisa quando corta: ele põe reticências e segue.
   * Foi assim que "reabasteça hoje" virou "reabaste…" na tela do dono.
   *
   * 26 caracteres é o que sobra para o texto naquele espaço, medido no
   * aparelho. Um teste de caractere não substitui a medida no navegador — que
   * existe em `scripts/dashboard-destilar-test.mjs` — mas pega a regressão
   * barata: a de alguém escrever uma frase mais longa.
   */
  const casos = [
    { autonomyDays: 0.2, checklistPct: 10 },
    { autonomyDays: 2, checklistPct: 40 },
    { autonomyDays: 7, checklistPct: 100 },
    { autonomyDays: null, checklistPct: 0 },
  ]

  for (const caso of casos) {
    for (const pt of [true, false]) {
      it(`${caso.autonomyDays ?? 'sem medida'} dias, ${pt ? 'pt' : 'en'}`, () => {
        const v = restingVerdict({
          riskState: 'stable',
          score: 14,
          stateLabel: 'Estável',
          alertCount: 0,
          pt,
          ...caso,
        })
        expect(v.lead.length + v.line.length).toBeLessThanOrEqual(30)
      })
    }
  }
})
