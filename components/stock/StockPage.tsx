'use client'

/**
 * "O que eu tenho" — o estoque da casa (INVENTORY-001 §3.1–§3.3, INV-T03).
 *
 * Substitui os seis editores de números (PREP-T07 / D-165) pela lista do
 * estoque, item a item, agrupada por lugar. A casa toda vê e edita (D-I5).
 * Os totais do topo vêm do estoque — os mesmos que Painel, Pilot e Sinais leem
 * pela projeção em `resource_inventory` (§4.2).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/lib/i18n'
import { CATEGORY_LABEL, categoryOf, type StockCategory } from '@/lib/resource-catalog'
import { MEALS_PER_DAY } from '@/lib/inventory'
import {
  expiringCount,
  expiryText,
  localToday,
  matchesQuery,
  mealsText,
  myHomeId,
  placeTree,
  presentCategories,
  quantityText,
  waterTotalText,
  type ApiHouse,
  type ApiItem,
  type PlaceNode,
} from '@/lib/stock-view'
import PreparednessNav from '@/components/world-v2/PreparednessNav'
import StockItemSheet, { type ItemPayload } from './StockItemSheet'
import StockPlaceSheet, { type PlaceMode } from './StockPlaceSheet'
import './stock.css'

type Lang = 'pt' | 'en'

const T = {
  pt: {
    eyebrow: 'Preparação', title: 'O que eu tenho', loading: 'Carregando o estoque…',
    water: 'Água da casa', food: 'Comida da casa', expiring: 'Vencem em 30 dias',
    meals: (m: string, d: string | null) => (d ? `${m} refeições · ${d} dias` : `${m} refeições`),
    search: 'Buscar no estoque', all: 'Tudo', addItem: '+ Item', addPlace: '+ Lugar', addBag: '+ Mochila',
    empty: 'Nada aqui ainda. Toque em "+ Item" para começar — ou marque "Tenho" num Sinal.',
    noMatch: 'Nenhum item encontrado.', editPlace: 'Editar', of: (n: string) => `de ${n}`,
    battery: 'Bateria (celular, power bank)', batteryNote: 'Não é item do estoque: é quanto de carga tem agora.',
    loadError: 'Não foi possível carregar o estoque. Tente de novo.', retry: 'Tentar de novo',
    saveError: 'Não foi possível gravar. Tente de novo.', saved: 'Salvo',
    home: 'Casa',
  },
  en: {
    eyebrow: 'Preparedness', title: 'What I have', loading: 'Loading your stock…',
    water: 'Home water', food: 'Home food', expiring: 'Expire in 30 days',
    meals: (m: string, d: string | null) => (d ? `${m} meals · ${d} days` : `${m} meals`),
    search: 'Search your stock', all: 'All', addItem: '+ Item', addPlace: '+ Place', addBag: '+ Backpack',
    empty: 'Nothing here yet. Tap "+ Item" to start — or mark "I have it" on a Signal.',
    noMatch: 'No items found.', editPlace: 'Edit', of: (n: string) => `${n}'s`,
    battery: 'Battery (phone, power bank)', batteryNote: 'Not a stock item: how much charge there is now.',
    loadError: 'Could not load your stock. Try again.', retry: 'Try again',
    saveError: 'Could not save. Try again.', saved: 'Saved',
    home: 'Home',
  },
}

type Sheet =
  | { kind: 'item'; item: ApiItem | null; locationId: string }
  | { kind: 'place'; place: PlaceMode }
  | null

/** Chama a API e devolve a casa nova, ou a mensagem de erro do servidor. */
async function call(url: string, method: string, body?: unknown): Promise<{ house?: ApiHouse; error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as { house?: ApiHouse; error?: string }
    if (!res.ok) return { error: data.error || String(res.status) }
    return { house: data.house }
  } catch {
    return { error: '' }
  }
}

export default function StockPage() {
  const { language } = useLanguage()
  const lang: Lang = language === 'en' ? 'en' : 'pt'
  const t = T[lang]
  const today = localToday()

  const [house, setHouse] = useState<ApiHouse | null>(null)
  const [size, setSize] = useState(0)
  const [battery, setBattery] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<StockCategory | 'all'>('all')
  const [sheet, setSheet] = useState<Sheet>(null)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const [h, hh, inv] = await Promise.all([
        fetch('/api/holdings', { cache: 'no-store' }),
        fetch('/api/household', { cache: 'no-store' }),
        fetch('/api/inventory', { cache: 'no-store' }),
      ])
      if (!h.ok) throw new Error(String(h.status))
      setHouse((await h.json()) as ApiHouse)
      const hd = hh.ok ? ((await hh.json()) as { size?: number; known?: boolean }) : null
      setSize(hd?.known ? Number(hd.size) || 0 : 0)
      const id = inv.ok ? ((await inv.json()) as { inventory?: { battery_percent?: number } }) : null
      setBattery(id?.inventory ? Number(id.inventory.battery_percent) || 0 : null)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const done = (r: { house?: ApiHouse; error?: string }): string | null => {
    if (r.error !== undefined) return r.error || t.saveError
    if (r.house) setHouse(r.house)
    setSheet(null)
    setFlash(t.saved)
    setTimeout(() => setFlash(null), 1800)
    return null
  }

  const saveItem = async (payload: ItemPayload, id: string | null) =>
    done(await call(id ? `/api/holdings/${id}` : '/api/holdings', id ? 'PATCH' : 'POST', payload))
  const removeItem = async (id: string) => done(await call(`/api/holdings/${id}`, 'DELETE'))
  const createPlace = async (body: Record<string, unknown>) => done(await call('/api/locations', 'POST', body))
  const updatePlace = async (id: string, body: Record<string, unknown>) => done(await call(`/api/locations/${id}`, 'PATCH', body))
  const deletePlace = async (loc: { id: string; holdingId: string | null }, moveTo: string | null) => {
    const body = moveTo ? { moveTo } : undefined
    return done(await call(loc.holdingId ? `/api/holdings/${loc.holdingId}` : `/api/locations/${loc.id}`, 'DELETE', body))
  }

  const saveBattery = async (v: number) => {
    setBattery(v)
    try {
      await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ battery_percent: v }) })
    } catch { /* o valor fica na tela; a próxima carga corrige */ }
  }

  const tree = useMemo(() => (house ? placeTree(house, t.home) : []), [house, t.home])
  const filtering = query.trim() !== '' || category !== 'all'
  const visible = useCallback(
    (i: ApiItem) => matchesQuery(i, query) && (category === 'all' || categoryOf(i.resourceKey) === category),
    [query, category],
  )

  if (loading) return <main className="st"><div className="st-wrap"><p className="st-empty">{t.loading}</p></div></main>

  if (loadError || !house) {
    return (
      <main className="st"><div className="st-wrap">
        <PreparednessNav />
        <p className="st-banner error" role="alert">{t.loadError}</p>
        <button type="button" className="st-btn" onClick={() => { setLoading(true); void load() }}>{t.retry}</button>
      </div></main>
    )
  }

  const fmt = (n: number) => new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 1 }).format(n)
  const meals = house.totals.foodPersonDays * MEALS_PER_DAY
  const days = size > 0 ? fmt(house.totals.foodPersonDays / size) : null
  const expiring = expiringCount(house, today)
  const cats = presentCategories(house)
  const multiAccount = house.accounts.length > 1

  const renderItem = (i: ApiItem) => {
    const exp = expiryText(i.expiresOn, today, lang)
    const sub = [
      [i.brand, i.model].filter(Boolean).join(' '),
      i.resourceKey === 'comida' ? mealsText(i.meals, lang) : null,
      multiAccount && i.profileId !== house.me ? t.of(i.ownerName || '—') : null,
    ].filter(Boolean).join(' · ')
    return (
      <button key={i.id} type="button" className={`st-item${i.quantity <= 0 ? ' zero' : ''}`}
        onClick={() => setSheet({ kind: 'item', item: i, locationId: i.locationId })}>
        <span className="st-item-main">
          <span className="st-item-name">{i.label}</span>
          {sub && <span className="st-item-sub">{sub}</span>}
          {exp && <span className={`st-tag ${exp.state}`}>{exp.text}</span>}
        </span>
        <span className="st-item-qty">{quantityText(i, lang)}</span>
      </button>
    )
  }

  /** Um lugar e o que tem dentro; durante a busca, só os que têm algo que bate. */
  const renderPlace = (node: PlaceNode): JSX.Element | null => {
    const items = node.items.filter(visible)
    const children = node.children.map(renderPlace).filter((c): c is JSX.Element => c !== null)
    if (filtering && !items.length && !children.length) return null
    const loc = house.locations.find(l => l.id === node.key)
    const bagItem = node.bagItemId ? house.items.find(i => i.id === node.bagItemId) : undefined
    const header = (
      <div className="st-place-head">
        {node.isBag && bagItem ? (
          // Tocar no nome da mochila abre a ficha do item (marca, modelo, validade).
          <button type="button" className="st-place-name bag st-place-link"
            onClick={() => setSheet({ kind: 'item', item: bagItem, locationId: bagItem.locationId })}>🎒 {node.name}</button>
        ) : (
          <span className="st-place-name">{node.name}</span>
        )}
        {loc && (
          <button type="button" className="st-place-edit" aria-label={`${t.editPlace}: ${node.name}`}
            onClick={() => setSheet({ kind: 'place', place: { mode: 'edit', location: loc } })}>⋯</button>
        )}
      </div>
    )
    const body = (
      <>
        {items.map(renderItem)}
        {children.length > 0 && <div className="st-nested">{children}</div>}
      </>
    )
    return <section key={node.key} className="st-place" aria-label={node.name}>{header}{body}</section>
  }

  const places = tree.map(renderPlace).filter((p): p is JSX.Element => p !== null)
  const anyItem = house.items.length > 0

  return (
    <main className="st">
      <div className="st-wrap">
        <header className="st-head">
          <p className="st-eyebrow">{t.eyebrow}</p>
          <h1 className="st-title">{t.title}</h1>
        </header>
        <PreparednessNav />

        <div className="st-totals" aria-live="polite">
          <div className="st-total"><b>{waterTotalText(house.totals.waterLiters, lang)}</b><span>{t.water}</span></div>
          <div className="st-total"><b>{t.meals(fmt(meals), days)}</b><span>{t.food}</span></div>
          <div className={`st-total${expiring ? ' warn' : ''}`}><b>{expiring}</b><span>{t.expiring}</span></div>
        </div>

        <div className="st-tools">
          <input className="st-search" type="search" value={query} placeholder={t.search} aria-label={t.search}
            onChange={e => setQuery(e.target.value)} />
          {cats.length > 1 && (
            <div className="st-chips" role="group" aria-label={lang === 'pt' ? 'Categorias' : 'Categories'}>
              <button type="button" className="st-chip" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>{t.all}</button>
              {cats.map(c => (
                <button key={c} type="button" className="st-chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
                  {CATEGORY_LABEL[c][lang]}
                </button>
              ))}
            </div>
          )}
          <div className="st-actions">
            <button type="button" className="st-btn primary" onClick={() => setSheet({ kind: 'item', item: null, locationId: myHomeId(house) })}>{t.addItem}</button>
            <button type="button" className="st-btn" onClick={() => setSheet({ kind: 'place', place: { mode: 'new-place' } })}>{t.addPlace}</button>
            <button type="button" className="st-btn" onClick={() => setSheet({ kind: 'place', place: { mode: 'new-bag' } })}>{t.addBag}</button>
          </div>
        </div>

        {flash && <p className="st-banner ok" role="status">✓ {flash}</p>}

        {!anyItem ? <p className="st-empty">{t.empty}</p> : places.length ? places : <p className="st-empty">{t.noMatch}</p>}

        {battery !== null && (
          <label className="st-field">
            <span>{t.battery}: {battery}%</span>
            <input type="range" min={0} max={100} step={5} value={battery}
              onChange={e => setBattery(Number(e.target.value))}
              onPointerUp={e => void saveBattery(Number((e.target as HTMLInputElement).value))}
              onKeyUp={e => void saveBattery(Number((e.target as HTMLInputElement).value))} />
            <span className="st-note">{t.batteryNote}</span>
          </label>
        )}
      </div>

      {sheet?.kind === 'item' && (
        <StockItemSheet lang={lang} house={house} item={sheet.item} defaultLocationId={sheet.locationId}
          onClose={() => setSheet(null)} onSave={saveItem} onRemove={removeItem} />
      )}
      {sheet?.kind === 'place' && (
        <StockPlaceSheet lang={lang} house={house} sheet={sheet.place} defaultParentId={myHomeId(house)}
          onClose={() => setSheet(null)} onCreate={createPlace} onUpdate={updatePlace} onDelete={deletePlace} />
      )}
    </main>
  )
}
