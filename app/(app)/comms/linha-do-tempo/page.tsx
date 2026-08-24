'use client'

/**
 * `/comms/linha-do-tempo` — o que aconteceu no círculo (COMMS-T12 / D-188).
 *
 * Saiu de `?view=timeline`. O Inbox global aponta para itens individuais, e
 * agora a própria linha do tempo tem endereço para onde apontar.
 */
import CommsSections from '@/components/world-v2/CommsSections'

export default function Page() {
  return <CommsSections section="timeline" />
}
