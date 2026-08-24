import { Suspense } from 'react'
import RosterPage from '@/components/world-v2/RosterPage'

/**
 * `useSearchParams()` obriga uma fronteira de Suspense: sem ela, o Next
 * desiste da geração estática da rota inteira. O build reclamou antes de isso
 * virar uma página que renderiza em branco no telefone.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <RosterPage />
    </Suspense>
  )
}
