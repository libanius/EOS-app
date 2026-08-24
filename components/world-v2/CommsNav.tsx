'use client'

/**
 * As seções do COMMS (COMMS-T12 / D-188).
 *
 * COMMS era o **último domínio sem faixa** — e o único que ainda alternava
 * seção com `?view=` em memória. `docs/35` já apontava o custo disso: estado de
 * navegação que só existe em memória não recebe push, QR, atalho de manifesto
 * nem link de convite, e o EOS vive dos quatro.
 *
 *   Conversas       a lista, e cada thread em `/comms/[id]`
 *   Rádio           frequências da família, editável por Admin/Editor
 *   Linha do tempo  o que aconteceu no círculo
 */

import { useLanguage } from '@/lib/i18n'
import DomainNav from './DomainNav'

const DESTINOS = [
  { href: '/comms', pt: 'Conversas', en: 'Chats' },
  { href: '/comms/radio', pt: 'Rádio', en: 'Radio' },
  { href: '/comms/linha-do-tempo', pt: 'Linha do tempo', en: 'Timeline' },
]

export default function CommsNav() {
  const { language } = useLanguage()
  return (
    <DomainNav
      destinos={DESTINOS}
      rotulo={language === 'pt' ? 'Seções do Comms' : 'Comms sections'}
    />
  )
}
