/**
 * GET /api/household — quem é a casa, e quanto ela tem (D-123).
 *
 * As telas não podem montar a casa sozinhas: somar o inventário de quem mora
 * junto exige ler dado de outra conta, e a RLS impede — corretamente. O
 * consentimento que autoriza é o `household_status = 'confirmed'`, e quem sabe
 * ler isso é `lib/household.ts`, no servidor.
 *
 * Antes desta rota, Família e Preparação calculavam autonomia cada uma do seu
 * jeito, lendo a lista digitada à mão. Duas telas, duas contas, o mesmo usuário.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getHousehold, autonomyDays } from '@/lib/household'
import { logError } from '@/lib/error-log'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const household = await getHousehold(auth.user.id)
    return NextResponse.json(
      {
        ...household,
        // Calculado aqui para que nenhuma tela invente a própria fórmula — foi
        // assim que Família e Preparação passaram a discordar.
        autonomyDays: household.known ? autonomyDays(household.inventory, household.size) : null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    await logError('api/household', e, { userId: auth.user.id })
    return NextResponse.json({ error: 'Falha ao montar a casa' }, { status: 500 })
  }
}
