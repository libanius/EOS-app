/**
 * O que o Pilot mede, e o que ele se recusa a guardar (PILOT-T04 / D-132).
 *
 * Este é o último portão de lançamento que o dono definiu. A spec pede cinco
 * famílias de métrica; este arquivo é a lista fechada do que existe, e a
 * fronteira de privacidade em código.
 *
 * A REGRA: nada aqui aceita texto livre. A pergunta que a pessoa fez, a
 * resposta do Pilot, a coordenada dela e qualquer dado de saúde não têm campo
 * onde caber. A tabela também não tem coluna de texto — a linha está desenhada
 * duas vezes de propósito, porque telemetria é a tabela que mais cresce e a
 * que menos gente audita.
 *
 * O QUE ISTO NÃO MEDE, e é honesto dizer: a spec pede "as pessoas entendem o
 * que GO significa?". Comportamento não responde isso — só pesquisa responde.
 * O que dá para observar é o PROXY: depois de um veredito, a pessoa seguiu a
 * alça? Está registrado como `handle`, e está anotado no doc como proxy, não
 * como resposta.
 */

/** Os eventos que existem. A mesma lista está no CHECK da migration. */
export const PILOT_EVENTS = [
  'opened',
  'intent',
  'asked',
  'answered',
  'verdict',
  'handle',
  'task_added',
  'memory_saved',
  'offline',
  'closed',
] as const

export type PilotEventName = (typeof PILOT_EVENTS)[number]

/** Os vereditos determinísticos do guard (D-125). */
export const PILOT_VERDICTS = ['ready', 'watch', 'hold', 'act'] as const
export type PilotVerdict = (typeof PILOT_VERDICTS)[number]

/**
 * As cinco intenções, mais `free` para a pergunta digitada.
 *
 * Os nomes são os do motor (`components/world-v2/pilot-engine.ts`), não os da
 * prosa da spec. Um vocabulário paralelo de métrica é como um painel passa a
 * contar uma coisa e o produto a fazer outra.
 */
export const PILOT_INTENTS = ['now', 'stay_or_go', 'endurance', 'gaps', 'outside', 'free'] as const
export type PilotIntent = (typeof PILOT_INTENTS)[number]

/** De onde o toque partiu. */
export const PILOT_SURFACES = ['orb', 'bar', 'dock', 'chip'] as const
export type PilotSurface = (typeof PILOT_SURFACES)[number]

/** Um evento já validado, pronto para virar linha. */
export type PilotEvent = {
  event: PilotEventName
  verdict?: PilotVerdict | null
  intent?: PilotIntent | null
  surface?: PilotSurface | null
  ms?: number | null
}

/** Uma hora. Acima disso o número é relógio errado, não espera. */
const MS_MAX = 3_600_000

/**
 * Valida e limpa um evento vindo do cliente.
 *
 * Devolve `{ ok: false, reason }` em vez de jogar fora em silêncio. Foi assim
 * que um bug ficou meses escondido neste repositório: um caminho de escape que
 * não dizia nada. Quem chama registra o motivo — uma telemetria que descarta
 * calada mente duas vezes, porque o gráfico fica bonito e vazio.
 */
export function parsePilotEvent(bruto: unknown): { ok: true; event: PilotEvent } | { ok: false; reason: string } {
  if (!bruto || typeof bruto !== 'object') return { ok: false, reason: 'não é objeto' }
  const e = bruto as Record<string, unknown>

  if (typeof e.event !== 'string' || !(PILOT_EVENTS as readonly string[]).includes(e.event)) {
    return { ok: false, reason: `evento desconhecido: ${String(e.event).slice(0, 40)}` }
  }

  const enumOuNulo = <T extends string>(v: unknown, lista: readonly T[], nome: string) => {
    if (v === undefined || v === null || v === '') return { ok: true as const, valor: null }
    if (typeof v === 'string' && (lista as readonly string[]).includes(v)) return { ok: true as const, valor: v as T }
    return { ok: false as const, reason: `${nome} inválido: ${String(v).slice(0, 40)}` }
  }

  const veredito = enumOuNulo(e.verdict, PILOT_VERDICTS, 'verdict')
  if (!veredito.ok) return { ok: false, reason: veredito.reason }
  const intencao = enumOuNulo(e.intent, PILOT_INTENTS, 'intent')
  if (!intencao.ok) return { ok: false, reason: intencao.reason }
  const superficie = enumOuNulo(e.surface, PILOT_SURFACES, 'surface')
  if (!superficie.ok) return { ok: false, reason: superficie.reason }

  let ms: number | null = null
  if (e.ms !== undefined && e.ms !== null) {
    const n = Number(e.ms)
    if (!Number.isFinite(n) || n < 0) return { ok: false, reason: `ms inválido: ${String(e.ms).slice(0, 40)}` }
    ms = Math.min(Math.round(n), MS_MAX - 1)
  }

  return {
    ok: true,
    event: {
      event: e.event as PilotEventName,
      verdict: veredito.valor,
      intent: intencao.valor,
      surface: superficie.valor,
      ms,
    },
  }
}

/**
 * As chaves que um evento pode ter. Nada além disto atravessa.
 *
 * Um allowlist e não um denylist: com denylist, o dia em que alguém acrescentar
 * `question` no cliente, ela passa. Com allowlist, ela é descartada e o motivo
 * fica registrado.
 */
export const PILOT_EVENT_KEYS = ['event', 'verdict', 'intent', 'surface', 'ms'] as const

/** Chaves que vieram e não são permitidas — para o chamador registrar. */
export function chavesEstranhas(bruto: unknown): string[] {
  if (!bruto || typeof bruto !== 'object') return []
  return Object.keys(bruto as object).filter(k => !(PILOT_EVENT_KEYS as readonly string[]).includes(k))
}

// ── Os agregados que respondem à spec ────────────────────────────────────────

export type PilotLinha = {
  user_id: string
  event: PilotEventName
  verdict: PilotVerdict | null
  intent: PilotIntent | null
  surface: PilotSurface | null
  ms: number | null
  created_at: string
}

export type PilotResumo = {
  /** Descoberta */
  usuariosQueAbriram: number
  aberturas: number
  medianaAteAbrirMs: number | null
  intencoesMaisUsadas: Array<{ intent: PilotIntent; n: number }>
  /** Confiança: a pessoa fez algo com a resposta? */
  respostas: number
  medianaEsperaMs: number | null
  alcasSeguidas: number
  tarefasCriadas: number
  taxaDeAcao: number
  /** Retenção: voltou noutro dia? */
  usuariosQueVoltaram: number
  taxaDeRetorno: number
  /** Personalização */
  memoriasSalvas: number
  /** Segurança: com que frequência a regra determinística falou, e o quê */
  vereditos: Record<PilotVerdict, number>
  vereditosCriticos: number
  /** Honestidade: quantas perguntas caíram sem rede */
  semRede: number
  total: number
}

const mediana = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

const dia = (iso: string) => iso.slice(0, 10)

/**
 * Transforma as linhas cruas nos números da spec.
 *
 * Função pura de propósito: o agregado é a parte que mais fácil se erra em
 * silêncio — uma divisão por zero vira `NaN`, e `NaN` num painel parece um
 * traço em vez de um bug. Aqui ela é testável sem banco.
 */
export function resumirPilot(linhas: PilotLinha[]): PilotResumo {
  const de = (e: PilotEventName) => linhas.filter(l => l.event === e)

  const aberturas = de('opened')
  const usuariosQueAbriram = new Set(aberturas.map(l => l.user_id))

  const porIntencao = new Map<PilotIntent, number>()
  for (const l of de('intent')) if (l.intent) porIntencao.set(l.intent, (porIntencao.get(l.intent) ?? 0) + 1)

  const respostas = de('answered')
  const alcas = de('handle')
  const tarefas = de('task_added')

  // Retenção = abriu em mais de um dia distinto. Duas aberturas no mesmo dia
  // são uma sessão, não um retorno.
  const diasPorPessoa = new Map<string, Set<string>>()
  for (const l of aberturas) {
    if (!diasPorPessoa.has(l.user_id)) diasPorPessoa.set(l.user_id, new Set())
    diasPorPessoa.get(l.user_id)?.add(dia(l.created_at))
  }
  const voltaram = Array.from(diasPorPessoa.values()).filter(d => d.size > 1).length

  const vereditos = { ready: 0, watch: 0, hold: 0, act: 0 } as Record<PilotVerdict, number>
  for (const l of de('verdict')) if (l.verdict) vereditos[l.verdict] += 1

  const denominador = respostas.length
  return {
    usuariosQueAbriram: usuariosQueAbriram.size,
    aberturas: aberturas.length,
    medianaAteAbrirMs: mediana(aberturas.map(l => l.ms).filter((n): n is number => typeof n === 'number')),
    intencoesMaisUsadas: Array.from(porIntencao.entries())
      .map(([intent, n]) => ({ intent, n }))
      .sort((a, b) => b.n - a.n),
    respostas: respostas.length,
    medianaEsperaMs: mediana(respostas.map(l => l.ms).filter((n): n is number => typeof n === 'number')),
    alcasSeguidas: alcas.length,
    tarefasCriadas: tarefas.length,
    // Sem resposta nenhuma, a taxa é 0 e não `NaN`: um traço num painel se
    // confunde com "sem dado", e este número decide um lançamento.
    taxaDeAcao: denominador ? Math.round(((alcas.length + tarefas.length) / denominador) * 100) : 0,
    usuariosQueVoltaram: voltaram,
    taxaDeRetorno: usuariosQueAbriram.size ? Math.round((voltaram / usuariosQueAbriram.size) * 100) : 0,
    memoriasSalvas: de('memory_saved').length,
    vereditos,
    vereditosCriticos: vereditos.act + vereditos.hold,
    semRede: de('offline').length,
    total: linhas.length,
  }
}
