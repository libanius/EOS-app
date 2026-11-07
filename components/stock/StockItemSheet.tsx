'use client'

/**
 * A ficha do item: criar e editar (INVENTORY-001 §3.1, §3.3, INV-T03).
 *
 * Criar: nome (com sugestões do catálogo), quanto, onde; marca, modelo,
 * observação e validade são opcionais. Comida pede peso e tipo e mostra as
 * refeições estimadas (D-I6). Editar: os mesmos campos, mais +1/−1, mover e
 * remover — remover sempre confirma e diz o efeito no Sinal.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { catalogEntry, isCustomKey, suggest, unitsFor, type CatalogEntry } from '@/lib/resource-catalog'
import { FOOD_TYPES, mealsOf, type FoodType } from '@/lib/inventory'
import { mealsText, placeOptions, removalLeavesHouseWithout, type ApiHouse, type ApiItem } from '@/lib/stock-view'

type Lang = 'pt' | 'en'

export const FOOD_TYPE_LABEL: Record<FoodType, { pt: string; en: string }> = {
  arroz: { pt: 'Arroz', en: 'Rice' },
  feijao: { pt: 'Feijão seco', en: 'Dry beans' },
  macarrao: { pt: 'Macarrão', en: 'Pasta' },
  aveia: { pt: 'Aveia', en: 'Oats' },
  farinha: { pt: 'Farinha', en: 'Flour' },
  acucar: { pt: 'Açúcar ou mel', en: 'Sugar or honey' },
  'leite-po': { pt: 'Leite em pó', en: 'Powdered milk' },
  castanhas: { pt: 'Castanhas e amendoim', en: 'Nuts and peanut butter' },
  enlatado: { pt: 'Enlatado (peso com líquido)', en: 'Canned (weight with liquid)' },
  pronta: { pt: 'Refeição pronta / liofilizada', en: 'Ready meal / freeze-dried' },
  outro: { pt: 'Outro', en: 'Other' },
}

const T = {
  pt: {
    newTitle: 'Novo item', name: 'Nome', namePh: 'Ex.: Galão de água, Rádio Midland',
    custom: 'Item livre: entra no estoque e no Pilot, mas não cobre Sinal.',
    kindIs: 'Conta como:', change: 'Trocar',
    packs: 'Embalagens', size: 'Tamanho de cada', total: 'Total', qty: 'Quantidade', unit: 'Unidade',
    weight: 'Peso de cada', foodType: 'Tipo de comida', override: 'Refeições (corrigir à mão, opcional)',
    place: 'Onde está', brand: 'Marca', model: 'Modelo', notes: 'Observação', expires: 'Validade (opcional)',
    save: 'Salvar', saving: 'Salvando…', close: 'Fechar', remove: 'Remover do estoque',
    confirmRemove: 'Remover este item?', confirmYes: 'Remover', confirmNo: 'Cancelar',
    leaves: (n: string) => `A casa vai ficar sem: ${n}. Os Sinais que pedem isto vão mostrar o item como faltando.`,
    owner: (n: string) => `De ${n}`, by: (c: string, u: string) => `Criado por ${c} · alterado por ${u}`,
    informed: 'Estoque informado: o número que a casa digitou antes, sem detalhar. Pode editar ou detalhar em itens.',
    bag: 'Esta mochila também é um lugar. Para mudar o nome ou apagar, use o lugar.',
    error: 'Não foi possível gravar. Tente de novo.',
  },
  en: {
    newTitle: 'New item', name: 'Name', namePh: 'E.g.: Water jug, Midland radio',
    custom: 'Free-form item: it goes into stock and the Pilot sees it, but it does not cover a Signal.',
    kindIs: 'Counts as:', change: 'Change',
    packs: 'Packages', size: 'Size of each', total: 'Total', qty: 'Quantity', unit: 'Unit',
    weight: 'Weight of each', foodType: 'Food type', override: 'Meals (manual correction, optional)',
    place: 'Where it is', brand: 'Brand', model: 'Model', notes: 'Note', expires: 'Expiration (optional)',
    save: 'Save', saving: 'Saving…', close: 'Close', remove: 'Remove from stock',
    confirmRemove: 'Remove this item?', confirmYes: 'Remove', confirmNo: 'Cancel',
    leaves: (n: string) => `Your home will have none of: ${n}. Signals that ask for it will show it as missing.`,
    owner: (n: string) => `${n}'s`, by: (c: string, u: string) => `Added by ${c} · changed by ${u}`,
    informed: 'Informed stock: the number your home typed before, without detail. You can edit it or detail it as items.',
    bag: 'This backpack is also a place. To rename or delete it, use the place.',
    error: 'Could not save. Try again.',
  },
}

export type ItemPayload = Record<string, unknown>

type Props = {
  lang: Lang
  house: ApiHouse
  item: ApiItem | null
  defaultLocationId: string
  onClose: () => void
  onSave: (payload: ItemPayload, id: string | null) => Promise<string | null>
  onRemove: (id: string) => Promise<string | null>
}

const num = (s: string) => Number(s.replace(',', '.'))
const isNum = (s: string) => s.trim() !== '' && Number.isFinite(num(s)) && num(s) >= 0

export default function StockItemSheet({ lang, house, item, defaultLocationId, onClose, onSave, onRemove }: Props) {
  const t = T[lang]
  const titleRef = useRef<HTMLHeadingElement>(null)
  const editing = item !== null

  const [label, setLabel] = useState(item?.label ?? '')
  const [resourceKey, setResourceKey] = useState<string | null>(item?.resourceKey ?? null)
  const entry: CatalogEntry | null = resourceKey ? catalogEntry(resourceKey) : null
  const measure = entry?.measure ?? 'count'
  const units = resourceKey ? unitsFor(resourceKey) : ['un']
  const [unit, setUnit] = useState(item?.unit && (units.includes(item.unit) || editing) ? item.unit : units[0])
  const [packs, setPacks] = useState('1')
  const [size, setSize] = useState(item ? String(item.quantity) : measure === 'count' ? '1' : '')
  const [foodType, setFoodType] = useState<FoodType>((item?.foodType as FoodType) ?? 'outro')
  const [override, setOverride] = useState(item?.mealsOverride !== null && item?.mealsOverride !== undefined ? String(item.mealsOverride) : '')
  const [locationId, setLocationId] = useState(item?.locationId ?? defaultLocationId)
  const [brand, setBrand] = useState(item?.brand ?? '')
  const [model, setModel] = useState(item?.model ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [expiresOn, setExpiresOn] = useState(item?.expiresOn ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // A unidade acompanha a chave escolhida (água: gal/L; comida: peso).
  useEffect(() => {
    if (!units.includes(unit) && !(editing && unit === item?.unit)) setUnit(units[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceKey])

  const suggestions = useMemo(() => (editing || resourceKey ? [] : suggest(label, 6)), [label, editing, resourceKey])
  const bagLocation = item ? house.locations.find(l => l.holdingId === item.id) : undefined
  const places = useMemo(
    () => placeOptions(house, lang === 'pt' ? 'Casa' : 'Home', bagLocation?.id),
    [house, lang, bagLocation?.id],
  )

  const multiPack = !editing && measure !== 'count' && measure !== 'money'
  const total = multiPack ? (isNum(packs) && isNum(size) ? num(packs) * num(size) : NaN) : isNum(size) ? num(size) : NaN
  const valid = label.trim() !== '' && Number.isFinite(total) && total >= 0 && (override === '' || isNum(override))
  const isFood = resourceKey === 'comida'
  const meals = isFood && Number.isFinite(total)
    ? mealsOf({ quantity: total, unit, foodType, mealsOverride: override !== '' && isNum(override) ? num(override) : null })
    : null

  const pick = (c: CatalogEntry) => {
    setResourceKey(c.key)
    // O que foi digitado era só o começo da sugestão ("comi" → "Comida…"): vira o nome.
    // Um nome próprio ("Galão Crystal Geyser") fica como está.
    const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    const typed = norm(label)
    if (!typed || norm(c.label[lang]).includes(typed) || norm(c.label[lang === 'pt' ? 'en' : 'pt']).includes(typed)) setLabel(c.label[lang])
    const u = unitsFor(c.key)[0]
    setUnit(u)
    if (c.measure === 'count') setSize('1')
  }

  const save = async () => {
    if (!valid) return
    setBusy(true); setError(null)
    const payload: ItemPayload = {
      label: label.trim(),
      quantity: Math.round(total * 1000) / 1000,
      unit,
      locationId,
      brand: brand.trim() || null,
      model: model.trim() || null,
      notes: notes.trim() || null,
      expiresOn: expiresOn || null,
    }
    if (resourceKey) payload.resourceKey = resourceKey
    if (isFood) {
      payload.foodType = foodType
      payload.mealsOverride = override !== '' ? num(override) : null
    }
    const err = await onSave(payload, item?.id ?? null)
    setBusy(false)
    if (err) setError(err)
  }

  // +1/−1 só muda o número na ficha; grava junto com o resto no Salvar
  // (achado do Codex no PR #19: gravar na hora fechava a ficha e perdia as outras edições).
  const step = (delta: number) => {
    if (!item) return
    setSize(String(Math.max(0, (isNum(size) ? num(size) : item.quantity) + delta)))
  }

  const remove = async () => {
    if (!item) return
    setBusy(true); setError(null)
    const err = await onRemove(item.id)
    setBusy(false)
    if (err) setError(err)
  }

  const leaves = item ? removalLeavesHouseWithout(house, item) : false
  const showOwner = house.accounts.length > 1 && item && item.profileId !== house.me

  return (
    <div className="st-sheet-wrap" onClick={onClose}>
      <div className="st-sheet" role="dialog" aria-modal="true" aria-labelledby="st-item-title" onClick={e => e.stopPropagation()}>
        <div className="st-grip" aria-hidden="true" />
        <h2 id="st-item-title" ref={titleRef} tabIndex={-1}>{editing ? item.label : t.newTitle}</h2>
        {showOwner && <p className="st-meta">{t.owner(item.ownerName || '—')}</p>}
        {item?.provenance === 'BACKFILL' && <p className="st-note">{t.informed}</p>}
        {bagLocation && <p className="st-note">{t.bag}</p>}

        <label className="st-field">
          <span>{t.name}</span>
          <input value={label} placeholder={t.namePh} maxLength={120} disabled={busy || Boolean(bagLocation)}
            onChange={e => setLabel(e.target.value)} />
        </label>
        {!editing && resourceKey && entry && (
          // O recurso escolhido não muda quando o nome muda ("Comida" → "Arroz"):
          // trocar é explícito, por aqui (achado do Codex no PR #19).
          <div className="st-suggest">
            <span className="st-note">{t.kindIs}</span>
            <button type="button" className="st-chip" aria-pressed="true" aria-label={`${t.change}: ${entry.label[lang]}`}
              onClick={() => setResourceKey(null)}>{entry.label[lang]} ✕</button>
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="st-suggest">
            {suggestions.map(c => (
              <button key={c.key} type="button" className="st-chip" onClick={() => pick(c)}>{c.label[lang]}</button>
            ))}
          </div>
        )}
        {!editing && !resourceKey && label.trim() && suggestions.length === 0 && <p className="st-note">{t.custom}</p>}
        {resourceKey && isCustomKey(resourceKey) && <p className="st-note">{t.custom}</p>}

        {editing && measure === 'count' && (
          <div className="st-stepper">
            <button type="button" className="st-btn" aria-label="−1" disabled={busy || total <= 0} onClick={() => step(-1)}>−</button>
            <b>{Number.isFinite(total) ? total : item.quantity}</b>
            <button type="button" className="st-btn" aria-label="+1" disabled={busy} onClick={() => step(1)}>+</button>
          </div>
        )}

        {multiPack ? (
          <div className="st-row">
            <label className="st-field"><span>{t.packs}</span>
              <input inputMode="decimal" value={packs} onChange={e => setPacks(e.target.value)} disabled={busy} />
            </label>
            <label className="st-field"><span>{isFood ? t.weight : t.size}</span>
              <input inputMode="decimal" value={size} onChange={e => setSize(e.target.value)} disabled={busy} />
            </label>
            <label className="st-field"><span>{t.unit}</span>
              <select value={unit} onChange={e => setUnit(e.target.value)} disabled={busy}>
                {units.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
          </div>
        ) : !(editing && measure === 'count') ? (
          <div className="st-row">
            <label className="st-field"><span>{editing ? t.total : t.qty}</span>
              <input inputMode="decimal" value={size} onChange={e => setSize(e.target.value)} disabled={busy} />
            </label>
            {units.length > 1 || (editing && item?.unit && !units.includes(item.unit)) ? (
              <label className="st-field"><span>{t.unit}</span>
                <select value={unit} onChange={e => setUnit(e.target.value)} disabled={busy}>
                  {Array.from(new Set([...(editing && item?.unit ? [item.unit] : []), ...units])).map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
        {multiPack && Number.isFinite(total) && <p className="st-note">{t.total}: {Math.round(total * 100) / 100} {unit}</p>}

        {isFood && (
          <>
            <label className="st-field"><span>{t.foodType}</span>
              <select value={foodType} onChange={e => setFoodType(e.target.value as FoodType)} disabled={busy}>
                {FOOD_TYPES.map(f => <option key={f} value={f}>{FOOD_TYPE_LABEL[f][lang]}</option>)}
              </select>
            </label>
            {meals && <p className="st-note ok" aria-live="polite">{mealsText(meals, lang)}</p>}
            <label className="st-field"><span>{t.override}</span>
              <input inputMode="numeric" value={override} onChange={e => setOverride(e.target.value)} disabled={busy} />
            </label>
          </>
        )}

        <label className="st-field"><span>{t.place}</span>
          <select value={locationId} onChange={e => setLocationId(e.target.value)} disabled={busy}>
            {places.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>

        <div className="st-row">
          <label className="st-field"><span>{t.brand}</span><input value={brand} maxLength={120} onChange={e => setBrand(e.target.value)} disabled={busy} /></label>
          <label className="st-field"><span>{t.model}</span><input value={model} maxLength={120} onChange={e => setModel(e.target.value)} disabled={busy} /></label>
        </div>
        <label className="st-field"><span>{t.expires}</span>
          <input type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} disabled={busy} />
        </label>
        <label className="st-field"><span>{t.notes}</span>
          <textarea value={notes} maxLength={500} onChange={e => setNotes(e.target.value)} disabled={busy} />
        </label>

        {editing && item.createdByName && item.updatedByName && (
          <p className="st-meta">{t.by(item.createdByName, item.updatedByName)}</p>
        )}

        {error && <p className="st-banner error" role="alert">{error}</p>}

        <button type="button" className="st-btn primary block" disabled={busy || !valid} onClick={() => void save()}>
          {busy ? t.saving : t.save}
        </button>

        {editing && !bagLocation && (confirming ? (
          <div className="st-confirm" role="alertdialog" aria-label={t.confirmRemove}>
            <strong>{t.confirmRemove}</strong>
            {leaves && <span>{t.leaves(entry?.label[lang] ?? item.label)}</span>}
            <div className="st-row">
              <button type="button" className="st-btn danger" disabled={busy} onClick={() => void remove()}>{t.confirmYes}</button>
              <button type="button" className="st-btn" disabled={busy} onClick={() => setConfirming(false)}>{t.confirmNo}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="st-btn danger block" disabled={busy} onClick={() => setConfirming(true)}>{t.remove}</button>
        ))}

        <button type="button" className="st-btn block" onClick={onClose}>{t.close}</button>
      </div>
    </div>
  )
}
