/**
 * Catálogo de recursos do estoque (INVENTORY-001 §4.4).
 *
 * A chave (`resource_key`) é o que liga TER a PRECISAR (docs/37 §13.1): o
 * rádio do estoque cobre o rádio do Sinal porque os dois escrevem
 * `radio-comunicacao`. Por isso a lista mora num lugar só, e um teste garante
 * que toda chave de protocolo dos Sinais está aqui.
 *
 * Item com nome livre que não casa com o catálogo vira `custom:<slug>`: entra
 * no estoque e no Pilot, mas não cobre Sinal nenhum (E8).
 */

import { canonicalKey } from './checklist'
import type { Bilingual, SignalModule } from './signals'

export type StockCategory = SignalModule | 'equipamento' | 'outros'

export const CATEGORY_ORDER: StockCategory[] = [
  'agua', 'comida', 'saude', 'energia', 'comunicacao', 'documentos', 'casa', 'equipamento', 'outros',
]

export const CATEGORY_LABEL: Record<StockCategory, Bilingual> = {
  agua: { pt: 'Água', en: 'Water' },
  comida: { pt: 'Comida', en: 'Food' },
  saude: { pt: 'Saúde', en: 'Health' },
  energia: { pt: 'Energia', en: 'Power' },
  comunicacao: { pt: 'Comunicação', en: 'Communication' },
  documentos: { pt: 'Documentos e dinheiro', en: 'Documents and cash' },
  casa: { pt: 'Casa', en: 'Home' },
  equipamento: { pt: 'Equipamento', en: 'Gear' },
  outros: { pt: 'Outros', en: 'Other' },
}

/** Como a quantidade é medida. Define as unidades aceitas na entrada. */
export type Measure = 'volume' | 'mass' | 'count' | 'money'

export const UNITS_BY_MEASURE: Record<Measure, string[]> = {
  volume: ['gal', 'L'],
  mass: ['g', 'kg', 'lb', 'oz'],
  count: ['un'],
  money: ['USD', 'BRL'],
}

export type CatalogEntry = {
  key: string
  label: Bilingual
  category: StockCategory
  kind: 'CONSUMABLE' | 'DURABLE'
  measure: Measure
}

const e = (
  key: string, pt: string, en: string, category: StockCategory,
  kind: CatalogEntry['kind'] = 'DURABLE', measure: Measure = 'count',
): CatalogEntry => ({ key, label: { pt, en }, category, kind, measure })

export const RESOURCE_CATALOG: CatalogEntry[] = [
  // Água
  e('agua', 'Água potável', 'Drinking water', 'agua', 'CONSUMABLE', 'volume'),
  e('filtro-agua', 'Filtro ou purificador de água', 'Water filter or purifier', 'agua'),
  e('reservatorio-agua', 'Reservatório de água', 'Water container', 'agua'),
  // Comida
  e('comida', 'Comida não perecível', 'Non-perishable food', 'comida', 'CONSUMABLE', 'mass'),
  e('abridor-latas', 'Abridor de latas manual', 'Manual can opener', 'comida'),
  e('fogareiro', 'Fogareiro e combustível', 'Camp stove and fuel', 'comida'),
  // Saúde
  e('kit-medico', 'Kit de primeiros socorros', 'First aid kit', 'saude'),
  e('remedios-reserva', 'Remédios de uso contínuo', 'Daily medications', 'saude', 'CONSUMABLE'),
  e('higiene', 'Higiene e saneamento', 'Hygiene and sanitation', 'saude', 'CONSUMABLE'),
  // Energia
  e('lanterna', 'Lanterna', 'Flashlight', 'energia'),
  e('pilhas', 'Pilhas e baterias', 'Batteries', 'energia', 'CONSUMABLE'),
  e('power-bank', 'Power bank', 'Power bank', 'energia'),
  e('gerador-solar', 'Gerador ou painel solar', 'Generator or solar panel', 'energia'),
  e('combustivel', 'Combustível', 'Fuel', 'energia', 'CONSUMABLE', 'volume'),
  // Comunicação
  e('radio-comunicacao', 'Rádio (AM/FM/NOAA)', 'Radio (AM/FM/NOAA)', 'comunicacao'),
  e('plano-contato', 'Plano de contato da família', 'Family contact plan', 'comunicacao'),
  e('radios-comunicadores', 'Rádios comunicadores', 'Two-way radios', 'comunicacao'),
  // Documentos e dinheiro
  e('documentos', 'Cópias de documentos', 'Document copies', 'documentos'),
  e('dinheiro', 'Dinheiro em espécie', 'Cash', 'documentos', 'CONSUMABLE', 'money'),
  // Casa
  e('extintor', 'Extintor de incêndio', 'Fire extinguisher', 'casa'),
  // Equipamento
  e('mochila', 'Mochila', 'Backpack', 'equipamento'),
]

const BY_KEY = new Map(RESOURCE_CATALOG.map(c => [c.key, c]))

export function catalogEntry(key: string): CatalogEntry | null {
  return BY_KEY.get(key) ?? null
}

export const CUSTOM_PREFIX = 'custom:'

/** Item fora do catálogo: chave própria, que não cobre Sinal nenhum. */
export function customKey(label: string): string {
  const slug = canonicalKey(label)
  return slug ? `${CUSTOM_PREFIX}${slug}` : ''
}

export function isCustomKey(key: string): boolean {
  return key.startsWith(CUSTOM_PREFIX)
}

/** Categoria do item: a do catálogo, ou Outros. */
export function categoryOf(key: string): StockCategory {
  return catalogEntry(key)?.category ?? 'outros'
}

/** Unidades aceitas para a chave. Fora do catálogo: contagem. */
export function unitsFor(key: string): string[] {
  return UNITS_BY_MEASURE[catalogEntry(key)?.measure ?? 'count']
}

/**
 * Sugestões para o campo de nome: busca sem acento no nome PT e EN.
 * Vazio devolve nada — o catálogo inteiro não é sugestão, é lista.
 */
export function suggest(query: string, limit = 6): CatalogEntry[] {
  const q = canonicalKey(query)
  if (!q) return []
  return RESOURCE_CATALOG.filter(c =>
    canonicalKey(c.label.pt).includes(q) || canonicalKey(c.label.en).includes(q) || c.key.includes(q),
  ).slice(0, limit)
}
