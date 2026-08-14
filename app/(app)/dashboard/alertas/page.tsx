'use client'

/**
 * `/dashboard/alertas` — alertas oficiais e condições (NAV-T07 / D-182).
 *
 * Fim do achado A3 do `docs/35`: alertas viviam em DUAS telas — o cartão
 * "Alertas ativos" na folha do MUNDO e a tela `/weather` inteira, cada uma com
 * a própria linguagem visual e nenhuma dona do assunto.
 *
 * Agora o dono é aqui. O cartão da folha vira resumo com porta para cá.
 */

import AlertsPage from '@/components/world-v2/AlertsPage'

export default function Page() {
  return <AlertsPage />
}
