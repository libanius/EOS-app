'use client'

/**
 * `/preparedness/o-que-tenho` — o estoque da casa (INVENTORY-001 / INV-T03).
 *
 * Antes: os seis editores de números (PREP-T07 fase 2 / D-165). Agora: a lista
 * do estoque item a item, por lugar. `/inventory` continua redirecionando para cá.
 */

import StockPage from '@/components/stock/StockPage'

export default function Page() {
  return <StockPage />
}
