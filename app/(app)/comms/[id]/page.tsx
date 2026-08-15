'use client'

/**
 * `/comms/[id]` — uma conversa (COMMS-T12 / D-188).
 *
 * O thread ganhou endereço. Era `?view=chat&circleId=…`, um estado em memória
 * que não recebia push nem sobrevivia a um link compartilhado. Agora a conversa
 * do círculo e a conversa direta são a mesma rota com ids diferentes — que é o
 * ponto inteiro de a conversa ter virado entidade.
 */
import { useParams } from 'next/navigation'
import CommsSections from '@/components/world-v2/CommsSections'

export default function Page() {
  const params = useParams<{ id: string }>()
  return <CommsSections section="chat" conversationId={String(params?.id ?? '')} />
}
