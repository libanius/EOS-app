/**
 * O estoque da casa como o Pilot lê (INVENTORY-001 §3.6, INV-T05, critério 12).
 *
 * Os totais (água, comida, autonomia) o Pilot já recebe pela projeção. O que
 * faltava era o item: "onde está o rádio?", "o que vence este mês?", "a mochila
 * vermelha tem lanterna?". Sem isto, ele só podia dizer "a casa tem rádio".
 *
 * Função pura: recebe a casa como `loadHouse` devolve e escreve o bloco. Até
 * 40 itens (spec §3.6) — vencidos e a vencer primeiro, para nunca caírem fora.
 */

import { expiryState, mealsOf, type FoodType } from './inventory'
import type { EosLocation } from './holdings'

export const PILOT_STOCK_LIMIT = 40

type Item = {
  id: string
  profileId: string
  locationId: string
  label: string
  quantity: number
  unit: string | null
  brand: string | null
  model: string | null
  expiresOn: string | null
  resourceKey: string
  foodType: FoodType | null
  mealsOverride: number | null
}

export type PilotStockHouse = {
  me: string
  names: Map<string, string>
  homeRootIds: string[]
  locations: EosLocation[]
  items: Item[]
}

function placePath(house: PilotStockHouse, locationId: string, pt: boolean): string {
  const byId = new Map(house.locations.map(l => [l.id, l]))
  const homes = new Set(house.homeRootIds)
  const parts: string[] = []
  let cur = byId.get(locationId)
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    if (homes.has(cur.id)) { parts.unshift(pt ? 'Casa' : 'Home'); break }
    parts.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  if (parts[0] !== (pt ? 'Casa' : 'Home')) parts.push(pt ? '(fora de casa)' : '(away from home)')
  return parts.join(' › ')
}

function qty(i: Item, pt: boolean): string {
  if (i.resourceKey === 'comida') {
    const m = mealsOf(i)
    const peso = i.unit === 'g' && i.quantity >= 1000 ? `${(i.quantity / 1000).toFixed(1)} kg` : `${i.quantity} ${i.unit ?? ''}`.trim()
    return m ? `${peso}, ${m.estimated ? '≈' : ''}${m.meals} ${pt ? 'refeições' : 'meals'}` : peso
  }
  return `${i.quantity} ${i.unit ?? ''}`.trim()
}

/** O bloco para o prompt. Estoque vazio diz isso — nunca some (o Pilot não pode presumir). */
export function pilotStockBlock(house: PilotStockHouse, today: string, pt: boolean): string {
  const items = house.items.filter(i => i.quantity > 0)
  if (!items.length) {
    return pt
      ? 'ESTOQUE DA CASA: nenhum item registrado ainda. Não presuma o que a casa tem; sugira registrar em "O que eu tenho".'
      : 'HOUSEHOLD STOCK: no items recorded yet. Do not assume what the home has; suggest recording them under "What I have".'
  }

  const state = (i: Item) => expiryState(i.expiresOn, today)
  const rank = (i: Item) => (state(i) === 'expired' ? 0 : state(i) === 'soon' ? 1 : 2)
  const sorted = [...items].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
  const shown = sorted.slice(0, PILOT_STOCK_LIMIT)

  const line = (i: Item) => {
    const detail = [i.brand, i.model].filter(Boolean).join(' ')
    const owner = i.profileId !== house.me ? house.names.get(i.profileId) : null
    const s = state(i)
    const exp = i.expiresOn
      ? s === 'expired' ? (pt ? ` · VENCIDO em ${i.expiresOn}` : ` · EXPIRED on ${i.expiresOn}`)
        : s === 'soon' ? (pt ? ` · vence em ${i.expiresOn}` : ` · expires ${i.expiresOn}`)
          : (pt ? ` · validade ${i.expiresOn}` : ` · expires ${i.expiresOn}`)
      : ''
    return `- ${i.label}${detail ? ` (${detail})` : ''}: ${qty(i, pt)} — ${placePath(house, i.locationId, pt)}${owner ? (pt ? ` · de ${owner}` : ` · ${owner}'s`) : ''}${exp}`
  }

  const expired = items.filter(i => state(i) === 'expired').map(i => i.label)
  const soon = items.filter(i => state(i) === 'soon').map(i => i.label)

  const head = pt
    ? `ESTOQUE DA CASA (${items.length} ${items.length === 1 ? 'item' : 'itens'}${items.length > shown.length ? `, mostrando ${shown.length}` : ''}; hoje é ${today}). Use para dizer ONDE algo está, de QUEM é e o que VENCE. Item fora de casa não conta na autonomia da casa. Item vencido continua no estoque: avise, não descarte por conta própria.`
    : `HOUSEHOLD STOCK (${items.length} ${items.length === 1 ? 'item' : 'items'}${items.length > shown.length ? `, showing ${shown.length}` : ''}; today is ${today}). Use it to say WHERE something is, WHOSE it is and what EXPIRES. Items away from home do not count toward home autonomy. Expired items stay in stock: warn, do not discard on your own.`

  const alerts = [
    expired.length ? (pt ? `Vencidos: ${expired.join(', ')}.` : `Expired: ${expired.join(', ')}.`) : '',
    soon.length ? (pt ? `Vencem em até 30 dias: ${soon.join(', ')}.` : `Expire within 30 days: ${soon.join(', ')}.`) : '',
  ].filter(Boolean)

  return [head, ...alerts, ...shown.map(line)].join('\n')
}
