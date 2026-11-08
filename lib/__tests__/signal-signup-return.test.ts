import { NextRequest } from 'next/server'
import { signUp } from '../auth/actions'
import { GET } from '../../app/auth/callback/route'
import { onboardingDestination } from '../onboarding-return'
let emailRedirect = ''
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: {
    signUp: async (input: { options: { emailRedirectTo: string } }) => { emailRedirect = input.options.emailRedirectTo; return { error: null } },
    exchangeCodeForSession: async () => ({ error: null }),
  } }),
}))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))

describe('shared Signal signup return journey', () => {
  it('carries the destination through signup email, callback and saved-profile continuation', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://eos.test'
    await signUp({ name: 'Visitor', email: 'visitor@example.test', password: 'test-only', redirectTo: '/sinais/fortress' })
    const confirmation = new URL(emailRedirect)
    confirmation.searchParams.set('code', 'mock-email-confirmation')
    const response = await GET(new NextRequest(confirmation))
    const onboarding = new URL(response.headers.get('location')!)
    expect(onboarding.pathname).toBe('/onboarding')
    expect(onboardingDestination(onboarding.searchParams.get('redirectTo'), 3)).toBe('/sinais/fortress')
  })
  it('preserves simulation invitation priority and family setup for other signups', () => {
    expect(onboardingDestination('/sinais/fortress', 3, 'invite')).toBe('/sim/invite')
    expect(onboardingDestination('/sim/token', 3)).toBe('/sim/token')
    expect(onboardingDestination(null, 3)).toBe('/family?members=3')
    expect(onboardingDestination('//evil.example', 3)).toBe('/family?members=3')
  })
})
