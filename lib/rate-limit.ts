/**
 * EOS — Rate limiting
 *
 * Strategy:
 *   1. If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set,
 *      use @upstash/ratelimit → Redis sliding-window (works on Vercel Edge).
 *   2. Otherwise fall back to an in-memory Map (only safe for single-instance
 *      dev / preview environments).
 *
 * Default budget: 10 requests per 60 seconds per identifier (user id or IP).
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

function memoryLimit(id: string): RateLimitResult {
  const now = Date.now()
  const entry = memory.get(id)
  if (!entry || entry.reset <= now) {
    memory.set(id, { count: 1, reset: now + WINDOW_MS })
    return {
      success: true,
      limit: LIMIT,
      remaining: LIMIT - 1,
      reset: now + WINDOW_MS,
    }
  }
  entry.count += 1
  const remaining = Math.max(0, LIMIT - entry.count)
  return {
    success: entry.count <= LIMIT,
    limit: LIMIT,
    remaining,
    reset: entry.reset,
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function enforceRateLimit(
  identifier: string,
): Promise<RateLimitResult> {
  const redis = await getRedisLimiter()
  if (redis) return redis.limit(identifier)
  return memoryLimit(identifier)
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(r.limit),
    'X-RateLimit-Remaining': String(r.remaining),
    'X-RateLimit-Reset': String(Math.ceil(r.reset / 1000)),
  }
}
