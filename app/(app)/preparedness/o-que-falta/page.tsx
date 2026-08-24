'use client'

/**
 * `/preparedness/o-que-falta` — os requisitos da família (PREP-T07 / D-164).
 *
 * Rota real, e não estado em memória: o Pilot salva itens aqui e precisa poder
 * apontar para eles; `/checklist` redireciona para cá; e a BottomNav mantém
 * PREPARAÇÃO acesa sozinha, porque `isActive` já casa por prefixo de rota.
 */

import RequirementsPage from '@/components/world-v2/RequirementsPage'

export default function Page() {
  return <RequirementsPage />
}
