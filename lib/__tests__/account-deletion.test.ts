import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cancelBillingBeforeDeletion, removeNonCascadingData } from '../account-deletion'

/** Supabase falso: só o que as duas funções usam. Nada sai da máquina. */
function fakeAdmin(opts: {
  profile?: Record<string, unknown> | null
  profileError?: { message: string } | null
  files?: { name: string }[]
  listError?: { message: string } | null
  removeError?: { message: string } | null
  anonError?: { message: string } | null
}) {
  const calls = { removed: [] as string[], anonymized: null as string | null, listed: null as string | null }
  const admin = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.profile ?? null, error: opts.profileError ?? null }) }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, uid: string) => {
          if (table === 'error_log' && patch.user_id === null) calls.anonymized = uid
          return Promise.resolve({ error: opts.anonError ?? null })
        },
      }),
    }),
    storage: {
      from: () => ({
        list: (prefix: string) => { calls.listed = prefix; return Promise.resolve({ data: opts.files ?? [], error: opts.listError ?? null }) },
        remove: (paths: string[]) => { calls.removed.push(...paths); return Promise.resolve({ error: opts.removeError ?? null }) },
      }),
    },
  } as unknown as SupabaseClient
  return { admin, calls }
}

function fakeStripe(subs: { id: string; status: string }[], cancelError?: (id: string) => unknown) {
  const cancelled: string[] = []
  const stripe = {
    subscriptions: {
      list: jest.fn(() => Promise.resolve({ data: subs })),
      cancel: jest.fn((id: string) => {
        const err = cancelError?.(id)
        if (err) return Promise.reject(err)
        cancelled.push(id)
        return Promise.resolve({ id, status: 'canceled' })
      }),
    },
  } as unknown as Stripe
  return { stripe, cancelled }
}

describe('cobrança antes da exclusão (STORE-T03)', () => {
  it('quem nunca pagou não depende do Stripe', async () => {
    const { admin } = fakeAdmin({ profile: { stripe_customer_id: null, stripe_subscription_id: null } })
    expect(await cancelBillingBeforeDeletion('u1', admin, null)).toEqual({ ok: true, cancelled: [] })
  })

  it('cancela a assinatura do perfil E qualquer outra viva do cliente', async () => {
    const { admin } = fakeAdmin({ profile: { stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_a' } })
    const { stripe, cancelled } = fakeStripe([
      { id: 'sub_a', status: 'active' },
      { id: 'sub_b', status: 'past_due' },
      { id: 'sub_old', status: 'canceled' },
      { id: 'sub_exp', status: 'incomplete_expired' },
    ])
    const r = await cancelBillingBeforeDeletion('u1', admin, stripe)
    expect(r).toEqual({ ok: true, cancelled: ['sub_a', 'sub_b'] })
    expect(cancelled).toEqual(['sub_a', 'sub_b'])
  })

  it('com assinatura e sem Stripe configurado, recusa — nada pode ser apagado', async () => {
    const { admin } = fakeAdmin({ profile: { stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_a' } })
    const r = await cancelBillingBeforeDeletion('u1', admin, null)
    expect(r).toMatchObject({ ok: false, reason: 'stripe_unavailable' })
  })

  it('erro do Stripe para tudo', async () => {
    const { admin } = fakeAdmin({ profile: { stripe_customer_id: 'cus_1', stripe_subscription_id: null } })
    const { stripe } = fakeStripe([{ id: 'sub_a', status: 'active' }], () => Object.assign(new Error('rate limited'), { code: 'rate_limit' }))
    expect(await cancelBillingBeforeDeletion('u1', admin, stripe)).toMatchObject({ ok: false, reason: 'stripe_error', detail: 'rate limited' })
  })

  it('assinatura que já não existe na Stripe não bloqueia', async () => {
    const { admin } = fakeAdmin({ profile: { stripe_customer_id: null, stripe_subscription_id: 'sub_gone' } })
    const { stripe } = fakeStripe([], () => Object.assign(new Error('No such subscription'), { code: 'resource_missing' }))
    expect(await cancelBillingBeforeDeletion('u1', admin, stripe)).toEqual({ ok: true, cancelled: [] })
  })

  it('não consegue ler o perfil → recusa', async () => {
    const { admin } = fakeAdmin({ profileError: { message: 'timeout' } })
    expect(await cancelBillingBeforeDeletion('u1', admin, null)).toMatchObject({ ok: false })
  })
})

describe('resíduo que não cai em cascata', () => {
  it('remove as fotos da pasta da pessoa e desvincula o error_log', async () => {
    const { admin, calls } = fakeAdmin({ files: [{ name: 'avatar.jpg' }, { name: 'avatar.png' }] })
    expect(await removeNonCascadingData('u1', admin)).toEqual([])
    expect(calls.listed).toBe('u1')
    expect(calls.removed).toEqual(['u1/avatar.jpg', 'u1/avatar.png'])
    expect(calls.anonymized).toBe('u1')
  })

  it('falha de limpeza volta como lista, sem lançar', async () => {
    const { admin } = fakeAdmin({ listError: { message: 'bucket' }, anonError: { message: 'rls' } })
    expect(await removeNonCascadingData('u1', admin)).toEqual(['storage.list: bucket', 'error_log: rls'])
  })
})
