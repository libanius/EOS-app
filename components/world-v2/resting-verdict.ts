/**
 * O que a faixa de repouso diz (D-128).
 *
 * Esta é a linha mais valiosa do produto: é a única que a maioria das sessões
 * vai ler. Até aqui ela gastava essa linha no tempo — `14 · Estável` em verde —
 * numa casa com zero dias de água e zero por cento de plano.
 *
 * A causa não era descuido, era estrutural: `deriveRisk(s: WeatherSnapshot)` é
 * uma função **só de clima**, pela própria assinatura. Ela não tem como saber
 * que a família não tem água. Então o app tinha dois motores, dois veredictos e
 * uma tela — e o que tranquilizava era o que gritava.
 *
 * A regra aqui é uma só: **a faixa mostra o pior dos dois**. Num dia bonito com
 * a despensa vazia, ela fala da despensa. Numa tempestade com a casa pronta,
 * ela fala da tempestade. O outro número não some — vira apoio.
 *
 * Por que uma função pura, e não um `if` na tela: assim dá para provar por
 * teste que a conta nunca fica otimista, que é o erro caro num app de
 * emergência. A tela renderiza o resultado; ela não decide.
 */

export type RestingSeverity = 'safe' | 'watch' | 'warning' | 'critical'

export type RestingVerdict = {
  severity: RestingSeverity
  /** O que a faixa mostra em destaque: um número, ou uma quantidade de dias. */
  lead: string
  /** A frase ao lado. Curta — é uma faixa, não um parágrafo. */
  line: string
  /** De onde veio o veredito. A tela usa para decidir o que mostrar como apoio. */
  source: 'weather' | 'household'
  /**
   * Para onde levar quem tocar.
   *
   * Todo número passa a ter alça: antes "0 dias de água" era um veredito sem
   * saída — a pessoa lia o problema e não tinha como agir sobre ele.
   */
  href: string
}

const ORDEM: Record<RestingSeverity, number> = { safe: 0, watch: 1, warning: 2, critical: 3 }

/** O estado do clima, no vocabulário compartilhado. */
function doClima(riskState: string): RestingSeverity {
  if (riskState === 'critical') return 'critical'
  if (riskState === 'warning') return 'warning'
  if (riskState === 'watch') return 'watch'
  return 'safe'
}

/**
 * O estado da casa.
 *
 * Menos de um dia é crítico sem discussão: é o horizonte em que a decisão
 * muda hoje, não amanhã. Abaixo de três, atenção — é o piso que as agências de
 * preparação usam como mínimo doméstico.
 */
function daCasa(autonomyDays: number | null, checklistPct: number): RestingSeverity {
  if (autonomyDays === null) return 'watch'   // não medido não vale "seguro"
  if (autonomyDays < 1) return 'critical'
  if (autonomyDays < 3) return 'warning'
  if (checklistPct < 50) return 'watch'
  return 'safe'
}

export function restingVerdict(input: {
  riskState: string
  score: number | null
  stateLabel: string
  autonomyDays: number | null
  checklistPct: number
  alertCount: number
  pt: boolean
}): RestingVerdict {
  const { riskState, score, stateLabel, autonomyDays, checklistPct, alertCount, pt } = input

  const clima = doClima(riskState)
  const casa = daCasa(autonomyDays, checklistPct)

  // Empate vai para a CASA, de propósito: o clima já tem uma aba inteira, e a
  // casa é a única coisa que só esta tela conta.
  const casaGanha = ORDEM[casa] >= ORDEM[clima] && casa !== 'safe'

  if (casaGanha) {
    if (autonomyDays === null) {
      return {
        severity: 'watch',
        lead: '—',
        line: pt ? 'Autonomia não medida' : 'Autonomy not measured',
        source: 'household',
        href: '/preparedness',
      }
    }
    const dias = autonomyDays < 10 ? autonomyDays.toFixed(1) : String(Math.round(autonomyDays))
    return {
      severity: casa,
      lead: dias,
      /*
       * Curto de propósito (D-131).
       *
       * A faixa em repouso é UMA linha de 390px dividida com o número grande e
       * com o botão. "0,0 dias de autonomia · reabasteça hoje" não cabia, e o
       * navegador cortava no meio da palavra: "reabaste…". Um veredito cortado
       * é pior que nenhum — a pessoa lê que algo está errado e não lê o quê.
       *
       * "de autonomia" era a parte descartável: o número com "dias" já diz a
       * grandeza, e a folha logo abaixo a explica por extenso. O que não podia
       * sair é a cláusula depois do "·", porque é ela que separa vermelho de
       * âmbar para quem não distingue as duas cores.
       */
      line:
        autonomyDays < 1
          ? (pt ? ' dias · reabasteça hoje' : ' days · restock today')
          : autonomyDays < 3
            ? (pt ? ' dias · abaixo do mínimo' : ' days · below the minimum')
            : (pt ? ` dias · plano ${checklistPct}% feito` : ` days · plan ${checklistPct}% done`),
      source: 'household',
      href: '/preparedness',
    }
  }

  return {
    severity: clima,
    lead: score === null ? '—' : String(score),
    line: pt
      ? `${stateLabel} · ${alertCount} ${alertCount === 1 ? 'alerta ativo' : 'alertas ativos'}`
      : `${stateLabel} · ${alertCount} active ${alertCount === 1 ? 'alert' : 'alerts'}`,
    source: 'weather',
    href: '/weather',
  }
}
