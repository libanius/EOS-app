/**
 * A tela do estoque — a parte pura (INVENTORY-001 §3.1–§3.3, INV-T03).
 *
 * Recebe a casa como `GET /api/holdings` devolve e prepara o que a tela mostra:
 * a árvore de lugares (uma Casa só, mesmo com várias contas — E20), os textos
 * de quantidade e de validade, e o aviso de quem remove o último item que
 * cobre um Sinal.
 */

import { catalogEntry, categoryOf, CATEGORY_ORDER, type StockCategory } from './resource-catalog'
import { expiryState, homeScope, litersOf, type MealsEstimate } from './inventory'
import { LITERS_PER_GALLON } from './units'
import type { EosLocation } from './holdings'

type Lang = 'pt' | 'en'

export type ApiLocation = EosLocation & { profileId: string; holdingId: string | null }

export type ApiItem = {
  id: string
  profileId: string
  locationId: string
  resourceKey: string
  label: string
  kind: 'CONSUMABLE' | 'DURABLE'
  quantity: number
  unit: string | null
  brand: string | null
  model: string | null
  notes: string | null
  expiresOn: string | null
  foodType: string | null
  mealsOverride: number | null
  provenance: string
  meals: MealsEstimate | null
  ownerName: string
  createdByName: string | null
  updatedByName: string | null
}

export type ApiHouse = {
  me: string
  accounts: Array<{ id: string; name: string; isMe: boolean }>
  homeRootIds: string[]
  locations: ApiLocation[]
  items: ApiItem[]
  totals: { waterLiters: number; foodPersonDays: number; itemsAtHome: number }
}

/* ── Árvore de lugares ─────────────────────────────────────────────────── */

export const HOME_NODE = 'home'

export type PlaceNode = {
  /** `home` para a Casa juntada; senão o id do lugar. */
  key: string
  /** Para onde vai um item movido para cá (na Casa: a Casa da minha conta). */
  targetId: string
  name: string
  kind: EosLocation['kind']
  isBag: boolean
  bagItemId: string | null
  depth: number
  items: ApiItem[]
  children: PlaceNode[]
}

/** A Casa padrão da minha conta; sem ela, a primeira Casa da casa. */
export function myHomeId(house: ApiHouse): string {
  const mine = house.locations.find(l => l.isDefault && l.profileId === house.me)
  return mine?.id ?? house.homeRootIds[0] ?? ''
}

/**
 * Casa primeiro (as Casas padrão de todas as contas, juntas), depois os lugares
 * soltos (o carro). Dentro de cada um: itens, depois sublugares e mochilas.
 * Lugar vazio some, exceto mochila (spec §3.1).
 */
export function placeTree(house: ApiHouse, homeName: string): PlaceNode[] {
  const homeIds = new Set(house.homeRootIds)
  const childrenOf = new Map<string | null, ApiLocation[]>()
  for (const l of house.locations) {
    const parent = l.parentId && homeIds.has(l.parentId) ? HOME_NODE : l.parentId
    if (homeIds.has(l.id)) continue
    const list = childrenOf.get(parent) ?? []
    list.push(l)
    childrenOf.set(parent, list)
  }
  // A mochila aparece uma vez só: como lugar, com o que tem dentro (D-I3).
  const bagItems = new Set(house.locations.map(l => l.holdingId).filter((x): x is string => Boolean(x)))
  const itemsAt = (ids: Set<string>) =>
    house.items.filter(i => ids.has(i.locationId) && !bagItems.has(i.id)).sort((a, b) => a.label.localeCompare(b.label))

  const build = (l: ApiLocation, depth: number, seen: Set<string>): PlaceNode | null => {
    if (seen.has(l.id)) return null // ciclo vindo do banco não trava a tela
    seen.add(l.id)
    const children = (childrenOf.get(l.id) ?? [])
      .map(c => build(c, depth + 1, seen))
      .filter((c): c is PlaceNode => c !== null)
    const node: PlaceNode = {
      key: l.id, targetId: l.id, name: l.name, kind: l.kind, isBag: Boolean(l.holdingId), bagItemId: l.holdingId,
      depth, items: itemsAt(new Set([l.id])), children,
    }
    return node.items.length || node.children.length || node.isBag ? node : null
  }

  const sortNodes = (a: PlaceNode, b: PlaceNode) => Number(a.isBag) - Number(b.isBag) || a.name.localeCompare(b.name)

  const homeChildren = (childrenOf.get(HOME_NODE) ?? [])
    .map(c => build(c, 1, new Set()))
    .filter((c): c is PlaceNode => c !== null)
    .sort(sortNodes)
  const home: PlaceNode = {
    key: HOME_NODE, targetId: myHomeId(house), name: homeName, kind: 'HOME', isBag: false, bagItemId: null,
    depth: 0, items: itemsAt(homeIds), children: homeChildren,
  }
  const loose = (childrenOf.get(null) ?? [])
    .map(c => build(c, 0, new Set()))
    .filter((c): c is PlaceNode => c !== null)
    .sort(sortNodes)
  return [home, ...loose]
}

/** Todos os lugares, como opções de um seletor ("Casa › Garagem › Mochila vermelha"). */
export function placeOptions(house: ApiHouse, homeName: string, excludeUnder?: string): Array<{ id: string; label: string }> {
  const homeIds = new Set(house.homeRootIds)
  const byId = new Map(house.locations.map(l => [l.id, l]))
  const excluded = new Set<string>()
  if (excludeUnder) {
    const stack = [excludeUnder]
    while (stack.length) {
      const id = stack.pop() as string
      if (excluded.has(id)) continue
      excluded.add(id)
      for (const l of house.locations) if (l.parentId === id) stack.push(l.id)
    }
  }
  const path = (l: ApiLocation): string => {
    const parts: string[] = []
    let cur: ApiLocation | undefined = l
    const seen = new Set<string>()
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      if (homeIds.has(cur.id)) { parts.unshift(homeName); break }
      parts.unshift(cur.name)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    return parts.join(' › ')
  }
  const out = [{ id: myHomeId(house), label: homeName }]
  for (const l of house.locations) {
    if (homeIds.has(l.id) || excluded.has(l.id)) continue
    out.push({ id: l.id, label: path(l) })
  }
  return out.sort((a, b) => (a.id === out[0].id ? -1 : b.id === out[0].id ? 1 : a.label.localeCompare(b.label)))
}

/* ── Textos ────────────────────────────────────────────────────────────── */

const fmt = (n: number, lang: Lang, digits = 1) =>
  new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: digits }).format(n)

/** "20 gal (75,7 L)", "5 kg", "2 un", "USD 200". Comida mostra as refeições à parte. */
export function quantityText(i: Pick<ApiItem, 'quantity' | 'unit' | 'resourceKey'>, lang: Lang): string {
  const u = (i.unit ?? '').toLowerCase()
  if (u === 'gal') return `${fmt(i.quantity, lang)} gal (${fmt(i.quantity * LITERS_PER_GALLON, lang)} L)`
  if (u === 'l') return `${fmt(i.quantity, lang)} L (${fmt(i.quantity / LITERS_PER_GALLON, lang)} gal)`
  if (u === 'g' && i.quantity >= 1000) return `${fmt(i.quantity / 1000, lang, 2)} kg`
  if (u === 'usd' || u === 'brl') return `${i.unit} ${fmt(i.quantity, lang, 2)}`
  if (u === 'refeicoes') return `${fmt(i.quantity, lang, 0)} ${lang === 'pt' ? 'refeições' : 'meals'}`
  if (u === 'dia-pessoa') return `${fmt(i.quantity, lang)} ${lang === 'pt' ? 'dias-pessoa' : 'person-days'}`
  if (u === 'un' || !u) return lang === 'pt' ? `${fmt(i.quantity, lang, 0)} un.` : `${fmt(i.quantity, lang, 0)} pcs`
  return `${fmt(i.quantity, lang, 2)} ${i.unit}`
}

/** "≈ 27 refeições (estimativa)" ou "30 refeições". */
export function mealsText(m: MealsEstimate | null, lang: Lang): string | null {
  if (!m) return null
  const n = fmt(m.meals, lang, 0)
  if (lang === 'pt') return m.estimated ? `≈ ${n} refeições (estimativa)` : `${n} refeições`
  return m.estimated ? `≈ ${n} meals (estimate)` : `${n} meals`
}

/** Validade em palavras. Sem data: nada (E13a). */
export function expiryText(expiresOn: string | null, today: string, lang: Lang): { state: 'expired' | 'soon'; text: string } | null {
  const s = expiryState(expiresOn, today)
  if (!s || !expiresOn) return null
  const days = Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (s === 'expired') return { state: s, text: lang === 'pt' ? 'Vencido' : 'Expired' }
  if (days === 0) return { state: s, text: lang === 'pt' ? 'Vence hoje' : 'Expires today' }
  return { state: s, text: lang === 'pt' ? `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}` : `Expires in ${days} ${days === 1 ? 'day' : 'days'}` }
}

/** Hoje como `YYYY-MM-DD` no fuso de quem vê. */
export function localToday(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/* ── Totais e avisos ───────────────────────────────────────────────────── */

export function expiringCount(house: ApiHouse, today: string): number {
  return house.items.filter(i => i.quantity > 0 && expiryState(i.expiresOn, today) !== null).length
}

/** Categorias presentes, na ordem do catálogo. */
export function presentCategories(house: ApiHouse): StockCategory[] {
  const set = new Set(house.items.map(i => categoryOf(i.resourceKey)))
  return CATEGORY_ORDER.filter(c => set.has(c))
}

/**
 * Remover este item deixa a casa sem o recurso? (spec §3.1: a confirmação diz
 * o efeito em palavras). Só para chaves do catálogo: item livre não cobre Sinal.
 */
export function removalLeavesHouseWithout(house: ApiHouse, item: ApiItem): boolean {
  if (!catalogEntry(item.resourceKey)) return false
  const scope = homeScope(house.locations, house.homeRootIds)
  if (!scope.has(item.locationId)) return false
  return !house.items.some(o => o.id !== item.id && o.resourceKey === item.resourceKey && o.quantity > 0 && scope.has(o.locationId))
}

/** Busca sem acento no nome, na marca e no modelo. */
export function matchesQuery(i: ApiItem, q: string): boolean {
  const norm = (s: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const needle = norm(q).trim()
  if (!needle) return true
  return [i.label, i.brand, i.model, i.notes].some(f => norm(f).includes(needle))
}

/** Água da casa em gal e L, para o topo. */
export function waterTotalText(liters: number, lang: Lang): string {
  return `${fmt(liters / LITERS_PER_GALLON, lang)} gal · ${fmt(liters, lang)} L`
}

/** Litros de um item de água, para a soma de um grupo (unidade estranha não soma). */
export function itemLiters(i: Pick<ApiItem, 'quantity' | 'unit'>): number {
  return litersOf(i.quantity, i.unit) ?? 0
}
