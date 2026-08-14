import { redirect } from 'next/navigation'

/**
 * `/circles` virou `/family/circulos` (NAV-T05 / D-178).
 *
 * Círculo é com quem a família compartilha — mesmo assunto que Família, e não
 * um domínio à parte. `useCircleFamily.ts` já fundia os dois no código para
 * desenhar as pessoas no mapa; a navegação passou a concordar.
 *
 * O slot que ele ocupava na barra global é o que permite ela encolher para
 * cinco em NAV-T06.
 */
export default function Page() {
  redirect('/family/circulos')
}
