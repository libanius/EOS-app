import { redirect } from 'next/navigation'

/**
 * `/checklist` apontava para `/preparedness` desde D-086, quando Checklist e
 * Recursos foram unificados. PREP-T07 devolveu ao checklist uma tela própria,
 * então o endereço antigo volta a ter um destino exato em vez de largar a
 * pessoa no topo de uma página que já foi longa.
 */
export default function Page() {
  redirect('/preparedness/o-que-falta')
}
