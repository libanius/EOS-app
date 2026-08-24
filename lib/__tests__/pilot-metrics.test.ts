/**
 * A telemetria do Pilot (PILOT-T04 / D-132).
 *
 * O que estes testes existem para impedir:
 *
 *  1. que a pergunta da pessoa vaze para a tabela de métrica       ← o principal
 *  2. que a lista de eventos do código e a do banco se separem
 *  3. que o vocabulário de intenções invente nomes que o motor não tem
 *  4. que um agregado devolva NaN e o painel mostre um traço
 *  5. que um evento inválido seja descartado em silêncio
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  PILOT_EVENTS,
  PILOT_INTENTS,
  PILOT_VERDICTS,
  PILOT_SURFACES,
  PILOT_EVENT_KEYS,
  parsePilotEvent,
  chavesEstranhas,
  resumirPilot,
  type PilotLinha,
} from '@/lib/pilot-metrics'

const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260808150000_pilot_events.sql'),
  'utf8',
)

describe('a pergunta da pessoa não entra na métrica', () => {
  it('texto livre é descartado, venha com que nome vier', () => {
    for (const chave of ['question', 'text', 'reply', 'message', 'prompt', 'lat', 'lng', 'medications']) {
      const bruto = { event: 'asked', [chave]: 'o que faço com a minha mãe acamada' }
      expect(chavesEstranhas(bruto)).toContain(chave)
      const r = parsePilotEvent(bruto)
      expect(r.ok).toBe(true)
      if (r.ok) {
        // O evento vale; a chave extra não existe no que sai daqui.
        expect(Object.keys(r.event)).not.toContain(chave)
        expect(JSON.stringify(r.event)).not.toMatch(/acamada/)
      }
    }
  })

  it('a tabela não tem nenhuma coluna de texto livre', () => {
    /*
     * A linha de privacidade está desenhada duas vezes: no código e no esquema.
     * Toda coluna `text` desta tabela tem que ter um CHECK com lista fechada —
     * uma coluna de texto sem CHECK é onde a conversa acabaria parando.
     *
     * O RECORTE É ANCORADO EM LINHA de propósito. A primeira versão cortava no
     * primeiro `);` do arquivo e caiu dentro de um COMENTÁRIO que terminava com
     * `pilot-engine.ts`);` — o teste passava vendo duas das quatro colunas, e
     * passou também quando acrescentei uma coluna de texto solta para conferir.
     * Foi o controle negativo que pegou; sem ele, isto teria entrado como
     * guarda de privacidade sem guardar nada.
     */
    const linhas = migration.split('\n')
    const inicio = linhas.findIndex(l => l.startsWith('create table'))
    const fim = linhas.findIndex((l, i) => i > inicio && l.trim() === ');')
    expect(inicio).toBeGreaterThanOrEqual(0)
    expect(fim).toBeGreaterThan(inicio)

    const corpo = linhas.slice(inicio, fim).join('\n')
    const colunasTexto = corpo
      .split('\n')
      .filter(l => /^\s{2}\w+ text\b/.test(l))
      .map(l => l.trim().split(' ')[0])

    // Conjunto EXATO, não "pelo menos uma": uma coluna nova de texto tem que
    // reprovar aqui e obrigar quem a criou a justificá-la.
    expect([...colunasTexto].sort()).toEqual(['event', 'intent', 'surface', 'verdict'])

    for (const nome of colunasTexto) {
      const i = corpo.indexOf(`  ${nome} text`)
      // Até a próxima definição de coluna, e não 400 caracteres arbitrários.
      const resto = corpo.slice(i + 2)
      const proxima = resto.search(/\n {2}\w+ (text|integer|uuid|bigserial|timestamptz)\b/)
      const trecho = proxima > 0 ? resto.slice(0, proxima) : resto
      expect(trecho).toMatch(/check\s*\(/i)
    }
  })
})

describe('o código e o banco falam a mesma língua', () => {
  it('todo evento do código está no CHECK da migration', () => {
    for (const e of PILOT_EVENTS) expect(migration).toContain(`'${e}'`)
  })

  it('todo veredito, intenção e superfície também', () => {
    for (const v of [...PILOT_VERDICTS, ...PILOT_INTENTS, ...PILOT_SURFACES]) {
      expect(migration).toContain(`'${v}'`)
    }
  })

  it('as intenções são as do motor, não nomes inventados da prosa', () => {
    const motor = fs.readFileSync(path.join(process.cwd(), 'components/world-v2/pilot-engine.ts'), 'utf8')
    const linha = motor.match(/export type PilotIntentId = ([^\n]+)/)?.[1] ?? ''
    const doMotor = Array.from(linha.matchAll(/'([a-z_]+)'/g)).map(m => m[1])
    expect(doMotor.length).toBeGreaterThan(0)
    for (const i of doMotor) expect(PILOT_INTENTS).toContain(i)
    // `free` é o único nome que o motor não tem — a pergunta digitada.
    expect(PILOT_INTENTS.filter(i => !doMotor.includes(i))).toEqual(['free'])
  })

  it('a lista de chaves permitidas cobre exatamente os campos que existem', () => {
    expect([...PILOT_EVENT_KEYS].sort()).toEqual(['event', 'intent', 'ms', 'surface', 'verdict'])
  })
})

describe('nada é descartado em silêncio', () => {
  it('evento desconhecido diz qual era', () => {
    const r = parsePilotEvent({ event: 'exfiltrate' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('exfiltrate')
  })

  it('enum errado diz qual campo', () => {
    const r = parsePilotEvent({ event: 'verdict', verdict: 'GO' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('verdict')
  })

  it('ms negativo é recusado; ms absurdo é aparado', () => {
    expect(parsePilotEvent({ event: 'opened', ms: -1 }).ok).toBe(false)
    const r = parsePilotEvent({ event: 'opened', ms: 99_999_999 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.event.ms).toBeLessThan(3_600_000)
  })

  it('campo ausente vira null, não erro — a maioria dos eventos não tem veredito', () => {
    const r = parsePilotEvent({ event: 'closed' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.event).toEqual({ event: 'closed', verdict: null, intent: null, surface: null, ms: null })
  })
})

describe('os agregados respondem à spec sem inventar', () => {
  const linha = (p: Partial<PilotLinha>): PilotLinha => ({
    user_id: 'u1',
    event: 'opened',
    verdict: null,
    intent: null,
    surface: null,
    ms: null,
    created_at: '2026-08-01T10:00:00Z',
    ...p,
  })

  it('tabela vazia devolve zeros, nunca NaN', () => {
    const r = resumirPilot([])
    // Um NaN num painel parece um traço, e este número decide um lançamento.
    for (const v of Object.values(r)) {
      if (typeof v === 'number') expect(Number.isNaN(v)).toBe(false)
    }
    expect(r.taxaDeAcao).toBe(0)
    expect(r.taxaDeRetorno).toBe(0)
    expect(r.medianaAteAbrirMs).toBeNull()
  })

  it('duas aberturas no mesmo dia são uma sessão, não um retorno', () => {
    const r = resumirPilot([
      linha({ created_at: '2026-08-01T10:00:00Z' }),
      linha({ created_at: '2026-08-01T18:00:00Z' }),
    ])
    expect(r.usuariosQueAbriram).toBe(1)
    expect(r.usuariosQueVoltaram).toBe(0)
    expect(r.taxaDeRetorno).toBe(0)
  })

  it('abrir em dois dias distintos é retorno', () => {
    const r = resumirPilot([
      linha({ created_at: '2026-08-01T10:00:00Z' }),
      linha({ created_at: '2026-08-02T10:00:00Z' }),
      linha({ user_id: 'u2', created_at: '2026-08-01T10:00:00Z' }),
    ])
    expect(r.usuariosQueAbriram).toBe(2)
    expect(r.usuariosQueVoltaram).toBe(1)
    expect(r.taxaDeRetorno).toBe(50)
  })

  it('a taxa de ação conta alça e tarefa sobre respostas', () => {
    const r = resumirPilot([
      linha({ event: 'answered' }),
      linha({ event: 'answered' }),
      linha({ event: 'handle' }),
    ])
    expect(r.taxaDeAcao).toBe(50)
  })

  it('a mediana da espera é a mediana, não a média', () => {
    const r = resumirPilot([
      linha({ event: 'answered', ms: 100 }),
      linha({ event: 'answered', ms: 200 }),
      linha({ event: 'answered', ms: 9000 }),
    ])
    // A média seria 3100 e descreveria uma espera que ninguém teve.
    expect(r.medianaEsperaMs).toBe(200)
  })

  it('os vereditos críticos são hold + act', () => {
    const r = resumirPilot([
      linha({ event: 'verdict', verdict: 'ready' }),
      linha({ event: 'verdict', verdict: 'hold' }),
      linha({ event: 'verdict', verdict: 'act' }),
    ])
    expect(r.vereditos).toEqual({ ready: 1, watch: 0, hold: 1, act: 1 })
    expect(r.vereditosCriticos).toBe(2)
  })

  it('as intenções saem ordenadas pela mais usada', () => {
    const r = resumirPilot([
      linha({ event: 'intent', intent: 'gaps' }),
      linha({ event: 'intent', intent: 'now' }),
      linha({ event: 'intent', intent: 'now' }),
    ])
    expect(r.intencoesMaisUsadas[0]).toEqual({ intent: 'now', n: 2 })
  })
})
