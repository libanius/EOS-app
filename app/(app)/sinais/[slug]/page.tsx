'use client'

/**
 * `/sinais/<slug>` — o protocolo de um Sinal (SIGNAL-001 §3.4).
 */

import { useParams } from 'next/navigation'
import SignalPage from '@/components/signals/SignalPage'

export default function Page() {
  const params = useParams<{ slug: string }>()
  return <SignalPage slug={params?.slug ?? ''} />
}
