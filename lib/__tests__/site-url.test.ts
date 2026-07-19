import { getSiteUrl, normalizeSiteUrl } from '../site-url'

describe('site url helpers', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('normalizes quoted and whitespace-padded URLs', () => {
    expect(normalizeSiteUrl(' "https://eos-app-fawn.vercel.app/\\n" ')).toBe('https://eos-app-fawn.vercel.app')
  })

  it('adds https to bare Vercel domains', () => {
    expect(normalizeSiteUrl('eos-app-fawn.vercel.app')).toBe('https://eos-app-fawn.vercel.app')
  })

  it('prefers the Vercel production URL over a manual value', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'eos-app-fawn.vercel.app'
    process.env.NEXT_PUBLIC_SITE_URL = '"https://bad.example.com"'
    expect(getSiteUrl()).toBe('https://eos-app-fawn.vercel.app')
  })

  it('falls back to localhost in local dev', () => {
    expect(getSiteUrl()).toBe('http://localhost:3000')
  })
})
