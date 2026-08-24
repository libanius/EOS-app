import { redirect } from 'next/navigation'

/**
 * `/ficha` virou `/family/ficha` (NAV-T05 / D-178).
 *
 * O endereço fica: é atalho do `manifest.json` e a ficha é das telas mais
 * salvas do app.
 *
 * ATENÇÃO: `/ficha/[id]` — o QR PÚBLICO para socorristas — **não muda**. Ele
 * está impresso, colado em geladeira e compartilhado; mexer nele quebraria o
 * papel de quem já imprimiu.
 */
export default function Page() {
  redirect('/family/ficha')
}
