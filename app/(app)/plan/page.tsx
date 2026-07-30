'use client'

/**
 * /plan — o plano de voo da família (D-066 / doc 18).
 *
 * Rota própria e não uma aba: o plano é editado em tempo de calma e lido em
 * tempo de evento, e nenhum dos dois momentos é "navegar entre abas".
 */

import PlanPage from '@/components/world-v2/PlanPage'

export default function Page() {
  return <PlanPage />
}
