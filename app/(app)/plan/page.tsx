import { redirect } from 'next/navigation'

/**
 * `/plan` virou `/preparedness/plano` (NAV-T04 / D-177).
 *
 * O endereço fica: é atalho do `manifest.json` e pode estar salvo em qualquer
 * lugar. Atualizar o manifesto exigiria reinstalação para parte de quem já tem
 * o app; o redirecionamento não custa nada a ninguém.
 */
export default function Page() {
  redirect('/preparedness/plano')
}
