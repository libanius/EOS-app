/** CONTENT-001: o editor antigo do EDU não altera item que veio de uma pauta. */

const update = jest.fn()
const row = { id: 'e1', version: 2, content_slug: 'fortress' as string | null }

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'owner@example.com' } }, error: null }) } }),
}))
jest.mock('@/lib/admin', () => ({ isAdminEmail: () => true }))
jest.mock('@/lib/comms-notifications', () => ({ createCommsNotifications: jest.fn() }))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: (...a: unknown[]) => { update(...a); return { eq: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'x' } }) }) }) } },
    }),
  }),
}))

import { NextRequest } from 'next/server'
import { POST } from '../route'

const req = () => new NextRequest('http://localhost/api/edu', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: 'e1', title: 'Editado', status: 'archived' }),
})

it('item com content_slug responde 409 e não é alterado', async () => {
  const res = await POST(req())
  expect(res.status).toBe(409)
  expect(update).not.toHaveBeenCalled()
})

it('item antigo, sem content_slug, segue editável', async () => {
  row.content_slug = null
  await POST(req())
  expect(update).toHaveBeenCalled()
})
