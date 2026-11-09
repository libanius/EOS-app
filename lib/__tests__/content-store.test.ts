import type { SupabaseClient } from '@supabase/supabase-js'
import { ContentStateReadError, packageState } from '../content-store'

function client(failingTable?: string) {
  return {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data: table === 'content_packages' && !failingTable ? { version: 1, status: 'review' } : null,
          error: table === failingTable ? { code: '42501', message: 'permission denied' } : null,
        }),
      }
      return query
    },
  } as unknown as SupabaseClient
}

it.each(['content_packages', 'signals', 'edu_content'])('não transforma falha em %s em estado vazio', async table => {
  await expect(packageState(client(table), 'agua')).rejects.toEqual(new ContentStateReadError(table, '42501'))
})

it('pauta recebida e não publicada continua aguardando aprovação', async () => {
  await expect(packageState(client(), 'agua')).resolves.toMatchObject({ latestVersion: 1, latestStatus: 'review', liveVersion: null, awaitingApproval: true })
})
