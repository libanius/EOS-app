/**
 * EOS — Rate limiting
 *
 * Estratégia, em ordem de preferência:
 *   1. Upstash Redis, se configurado — janela deslizante, funciona no Edge.
 *   2. **Postgres do Supabase** (D-118) — distribuído, sem fornecedor novo.
 *   3. Map em memória, só como último recurso.
 *
 * O nível 2 existe porque o 1 nunca foi configurado e o 3 **não limita nada em
 * serverless**: cada instância tem o próprio contador, então N instâncias
 * significam N vezes o limite. Enquanto isso, `/api/pilot/chat` — o endpoint mais
 * caro do produto — não chamava limitador nenhum, e cadastro é aberto.
 *
 * Orçamento padrão: 10 requisições por 60 s por identificador. Chamadas podem
 * pedir outro, e as rotas de IA usam DUAS janelas: uma curta contra rajada e uma
 * diária, que é a que protege a fatura.
 */

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

const WINDOW_MS = 60_000
const LIMIT = 10

// ─── Redis (production) ──────────────────────────────────────────────────────

let redisLimiter: {
  limit: (id: string) => Promise<RateLimitResult>
} | null = null

async function getRedisLimiter() {
  if (redisLimiter) return redisLimiter
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null
  }
  try {
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import('@upstash/ratelimit'),
      import('@upstash/redis'),
    ])
    const ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(LIMIT, '60 s'),
      prefix: 'eos:rl',
      analytics: false,
    })
    redisLimiter = {
      async limit(id: string) {
        const r = await ratelimit.limit(id)
        return {
          success: r.success,
          limit: r.limit,
          remaining: r.remaining,
          reset: r.reset,
        }
      },
    }
    return redisLimiter
  } catch {
    return null
  }
}

// ─── In-memory fallback ──────────────────────────────────────────────────────

const memory = new Map<string, { count: number; reset: number }>()

/**
 * Último recurso, e ele MENTE por natureza.
 *
 * Em serverless cada instância tem o próprio Map, então o teto real é o número
 * de instâncias vezes o limite. Medido: com este fallback, 14 chamadas seguidas
 * ao Pilot passaram todas.
 *
 * Ele ignorava também o limite pedido pelo chamador, usando sempre a constante
 * do módulo — os cabeçalhos `X-RateLimit-*` diziam 10 para quem pediu 3.
 */
function memoryLimit(id: string, limit = LIMIT, windowMs = WINDOW_MS): RateLimitResult {
  const now = Date.now()
  const entry = memory.get(id)
  if (!entry || entry.reset <= now) {
    memory.set(id, { count: 1, reset: now + windowMs })
    return { success: true, limit, remaining: limit - 1, reset: now + windowMs }
  }
  entry.count += 1
  return {
    success: entry.count <= limit,
    limit,
    remaining: Math.max(0, limit - entry.count),
    reset: entry.reset,
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Limitador em Postgres — distribuído e sem conta nova.
 *
 * O incremento é atômico dentro da função `consume_rate_limit`: ler-e-escrever
 * do lado do Node deixaria duas requisições simultâneas lerem o mesmo valor e
 * passarem as duas.
 *
 * Falha de banco NÃO bloqueia o usuário: devolve `null` e o chamador cai para o
 * nível seguinte. Um limitador que derruba o produto quando o Postgres tosse
 * troca um problema de custo por um problema de disponibilidade.
 */
async function postgresLimit(
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult | null> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    if (!admin) return null

    const { data, error } = await admin.rpc('consume_rate_limit', {
      p_key: identifier,
      p_window: windowSeconds,
      p_limit: limit,
    })
    if (error || !data) return null

    const row = Array.isArray(data) ? data[0] : data
    if (!row) return null

    return {
      success: row.allowed === true,
      limit,
      remaining: Math.max(0, limit - (row.used ?? 0)),
      reset: row.reset_at ? Date.parse(row.reset_at) : Date.now() + windowSeconds * 1000,
    }
  } catch {
    return null
  }
}

export async function enforceRateLimit(
  identifier: string,
  options?: { limit?: number; windowSeconds?: number },
): Promise<RateLimitResult> {
  const limit = options?.limit ?? LIMIT
  const windowSeconds = options?.windowSeconds ?? WINDOW_MS / 1000

  const redis = await getRedisLimiter()
  if (redis && !options) return redis.limit(identifier)

  const pg = await postgresLimit(identifier, limit, windowSeconds)
  if (pg) return pg

  return memoryLimit(identifier, limit, windowSeconds * 1000)
}

/**
 * Duas janelas de uma vez: rajada e diária.
 *
 * A curta protege a experiência (um botão preso não vira cem chamadas). A
 * diária protege a FATURA — é ela que impede uma conta de queimar o orçamento
 * da OpenAI ao longo de horas, coisa que nenhuma janela de um minuto detém.
 *
 * A janela diária é consumida primeiro de propósito: se o dia acabou, não faz
 * sentido gastar uma unidade do minuto.
 */
export async function enforceAiBudget(
  identifier: string,
  budget: { perMinute: number; perDay: number },
): Promise<{ result: RateLimitResult; scope: 'day' | 'minute' } | null> {
  const day = await enforceRateLimit(`${identifier}:day`, {
    limit: budget.perDay,
    windowSeconds: 86_400,
  })
  if (!day.success) return { result: day, scope: 'day' }

  const minute = await enforceRateLimit(`${identifier}:min`, {
    limit: budget.perMinute,
    windowSeconds: 60,
  })
  if (!minute.success) return { result: minute, scope: 'minute' }

  return null
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(r.remaining),
    'X-RateLimit-Reset': String(Math.ceil(r.reset / 1000)),
  }
}
