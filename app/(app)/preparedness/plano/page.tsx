'use client'

/**
 * `/preparedness/plano` — o plano de voo da família (NAV-T04 / D-177).
 *
 * Saiu de `/plan`, que era alcançável só pelo ☰ sem rótulo e pelo atalho do
 * PWA: **1409 linhas de funcionalidade atrás de um hambúrguer.** O plano é
 * preparação — define o que a família faz quando acontece — e agora vive onde
 * a preparação vive.
 *
 * `/plan` redireciona para cá, então o atalho do manifesto continua valendo.
 */

import PlanPage from '@/components/world-v2/PlanPage'

export default function Page() {
  return <PlanPage />
}
