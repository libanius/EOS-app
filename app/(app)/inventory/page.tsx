import { redirect } from 'next/navigation'

/**
 * `/inventory` apontava para `/preparedness` desde D-086. Com PREP-T07 fase 2
 * o estoque voltou a ter tela própria, e o endereço antigo reencontra o seu
 * destino exato.
 */
export default function Page() {
  redirect('/preparedness/o-que-tenho')
}
