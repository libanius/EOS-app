'use client'

/**
 * `/preparedness/o-que-tenho` — o estoque da casa (PREP-T07 fase 2 / D-165).
 *
 * `/inventory` redireciona para cá. O endereço antigo existe desde antes da
 * unificação de D-086 e continua salvo por aí; ele volta a ter destino exato
 * em vez de largar a pessoa no topo de uma página que fazia três coisas.
 */

import HoldingsPage from '@/components/world-v2/HoldingsPage'

export default function Page() {
  return <HoldingsPage />
}
