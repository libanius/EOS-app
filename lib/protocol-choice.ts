import type { ProtocolOption } from './signals'
import type { ApiItem } from './stock-view'

/** Detalhar o item genérico da própria conta não cria um segundo filtro. */
export function optionStockItem(items: ApiItem[], option: ProtocolOption, me: string | null): ApiItem | null {
  if (!me) return null
  const own = items.filter(item => item.profileId === me)
  const same = own.find(item => Boolean(option.model) && item.model === option.model && (item.brand || '') === (option.brand || ''))
  if (same) return same
  const generic = own.filter(item => !item.brand && !item.model)
  return generic.length === 1 ? generic[0] : null
}
