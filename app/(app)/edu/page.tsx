import { redirect } from 'next/navigation'

/**
 * `/edu` virou `/preparedness/aprender` (NAV-T04 / D-177).
 *
 * O EDU tinha UMA porta em todo o app — um card dentro da Preparação. Ele só
 * existe para virar ação de preparação (`/api/edu/actions`), então passa a ser
 * um subtópico dela em vez de uma rota solta que ninguém achava.
 */
export default function Page() {
  redirect('/preparedness/aprender')
}
