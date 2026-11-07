'use client'

/**
 * Lugares e mochilas (INVENTORY-001 §3.2, INV-T03).
 *
 * Criar: um lugar dentro da Casa (Garagem, Despensa), um lugar fora de casa
 * (o carro), ou uma mochila — que é item E lugar (D-I3). Editar: renomear,
 * mover, apagar. Apagar com coisas dentro pede um destino; nunca apaga em
 * cascata (E14, E21).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { placeOptions, type ApiHouse, type ApiLocation } from '@/lib/stock-view'

type Lang = 'pt' | 'en'

const T = {
  pt: {
    newPlace: 'Novo lugar', newBag: 'Nova mochila', edit: 'Lugar', name: 'Nome',
    placePh: 'Ex.: Garagem, Despensa', bagPh: 'Ex.: Mochila vermelha', inside: 'Dentro de',
    where: 'Onde fica', kind: 'Tipo', kindRoom: 'Dentro de casa (cômodo, armário)', kindCar: 'Fora de casa: carro',
    kindOther: 'Fora de casa: outro lugar', carNote: 'O que está fora de casa não conta na autonomia da casa.',
    save: 'Salvar', saving: 'Salvando…', close: 'Fechar', remove: 'Apagar este lugar', removeBag: 'Apagar esta mochila',
    moveTo: 'Para onde vão as coisas que estão dentro', confirmYes: 'Apagar', confirmNo: 'Cancelar',
    confirm: 'Apagar? Nenhum item é apagado: eles vão para o lugar escolhido.',
    confirmEmpty: 'Apagar este lugar?',
  },
  en: {
    newPlace: 'New place', newBag: 'New backpack', edit: 'Place', name: 'Name',
    placePh: 'E.g.: Garage, Pantry', bagPh: 'E.g.: Red backpack', inside: 'Inside',
    where: 'Where it is', kind: 'Type', kindRoom: 'At home (room, cabinet)', kindCar: 'Away from home: car',
    kindOther: 'Away from home: other place', carNote: 'What is away from home does not count toward home autonomy.',
    save: 'Save', saving: 'Saving…', close: 'Close', remove: 'Delete this place', removeBag: 'Delete this backpack',
    moveTo: 'Where the things inside go', confirmYes: 'Delete', confirmNo: 'Cancel',
    confirm: 'Delete? No item is deleted: they go to the place you chose.',
    confirmEmpty: 'Delete this place?',
  },
}

export type PlaceMode = { mode: 'new-place' } | { mode: 'new-bag' } | { mode: 'edit'; location: ApiLocation }

type Props = {
  lang: Lang
  house: ApiHouse
  sheet: PlaceMode
  defaultParentId: string
  onClose: () => void
  /** Devolve a mensagem de erro, ou `null` quando deu certo. */
  onCreate: (body: Record<string, unknown>) => Promise<string | null>
  onUpdate: (id: string, body: Record<string, unknown>) => Promise<string | null>
  onDelete: (location: ApiLocation, moveTo: string | null) => Promise<string | null>
}

export default function StockPlaceSheet({ lang, house, sheet, defaultParentId, onClose, onCreate, onUpdate, onDelete }: Props) {
  const t = T[lang]
  const titleRef = useRef<HTMLHeadingElement>(null)
  const loc = sheet.mode === 'edit' ? sheet.location : null
  const isBag = sheet.mode === 'new-bag' || Boolean(loc?.holdingId)
  const homeName = lang === 'pt' ? 'Casa' : 'Home'

  const [name, setName] = useState(loc?.name ?? '')
  const [kind, setKind] = useState<'room' | 'VEHICLE' | 'CUSTOM'>(loc && loc.parentId === null ? (loc.kind === 'VEHICLE' ? 'VEHICLE' : 'CUSTOM') : 'room')
  const options = useMemo(() => placeOptions(house, homeName, loc?.id), [house, homeName, loc?.id])
  const homeIds = new Set(house.homeRootIds)
  const currentParent = loc?.parentId ? (homeIds.has(loc.parentId) ? options[0]?.id : loc.parentId) : defaultParentId
  const [parentId, setParentId] = useState(currentParent ?? defaultParentId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const hasContents = loc
    ? house.items.some(i => i.locationId === loc.id) || house.locations.some(l => l.parentId === loc.id)
    : false
  const fallback = loc?.parentId ? (homeIds.has(loc.parentId) ? options[0]?.id : loc.parentId) : options[0]?.id
  const [moveTo, setMoveTo] = useState(fallback ?? '')

  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const away = !isBag && kind !== 'room'
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true); setError(null)
    const err = await fn()
    setBusy(false)
    if (err) setError(err)
  }

  const save = () => run(async () => {
    const n = name.trim()
    if (sheet.mode === 'new-bag') return onCreate({ name: n, bag: true, parentId })
    if (sheet.mode === 'new-place') return onCreate(away ? { name: n, parentId: null, kind } : { name: n, parentId, kind: 'CUSTOM' })
    const body: Record<string, unknown> = {}
    if (n !== loc!.name) body.name = n
    const newParent = away ? null : parentId
    const oldParent = loc!.parentId === null ? null : homeIds.has(loc!.parentId) ? options[0]?.id : loc!.parentId
    if (newParent !== oldParent) body.parentId = newParent
    if (!Object.keys(body).length) { onClose(); return null }
    return onUpdate(loc!.id, body)
  })

  const title = sheet.mode === 'new-place' ? t.newPlace : sheet.mode === 'new-bag' ? t.newBag : loc!.name
  // Tipo só se escolhe ao criar, ou num lugar que já está fora de casa.
  const editableKind = !isBag && (sheet.mode === 'new-place' || loc?.parentId === null)

  return (
    <div className="st-sheet-wrap" onClick={onClose}>
      <div className="st-sheet" role="dialog" aria-modal="true" aria-labelledby="st-place-title" onClick={e => e.stopPropagation()}>
        <div className="st-grip" aria-hidden="true" />
        <h2 id="st-place-title" ref={titleRef} tabIndex={-1}>{title}</h2>

        <label className="st-field"><span>{t.name}</span>
          <input value={name} maxLength={80} placeholder={isBag ? t.bagPh : t.placePh} onChange={e => setName(e.target.value)} disabled={busy} />
        </label>

        {editableKind && (
          <label className="st-field"><span>{t.kind}</span>
            <select value={kind} onChange={e => setKind(e.target.value as typeof kind)} disabled={busy}>
              <option value="room">{t.kindRoom}</option>
              <option value="VEHICLE">{t.kindCar}</option>
              <option value="CUSTOM">{t.kindOther}</option>
            </select>
          </label>
        )}
        {away && <p className="st-note">{t.carNote}</p>}

        {!away && (
          <label className="st-field"><span>{isBag ? t.where : t.inside}</span>
            <select value={parentId} onChange={e => setParentId(e.target.value)} disabled={busy}>
              {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        )}

        {error && <p className="st-banner error" role="alert">{error}</p>}

        <button type="button" className="st-btn primary block" disabled={busy || !name.trim()} onClick={() => void save()}>
          {busy ? t.saving : t.save}
        </button>

        {loc && (confirming ? (
          <div className="st-confirm" role="alertdialog" aria-label={isBag ? t.removeBag : t.remove}>
            <strong>{hasContents ? t.confirm : t.confirmEmpty}</strong>
            {hasContents && (
              <label className="st-field"><span>{t.moveTo}</span>
                <select value={moveTo} onChange={e => setMoveTo(e.target.value)} disabled={busy}>
                  {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </label>
            )}
            <div className="st-row">
              <button type="button" className="st-btn danger" disabled={busy || (hasContents && !moveTo)}
                onClick={() => void run(() => onDelete(loc, hasContents ? moveTo : null))}>{t.confirmYes}</button>
              <button type="button" className="st-btn" disabled={busy} onClick={() => setConfirming(false)}>{t.confirmNo}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="st-btn danger block" disabled={busy} onClick={() => setConfirming(true)}>
            {isBag ? t.removeBag : t.remove}
          </button>
        ))}

        <button type="button" className="st-btn block" onClick={onClose}>{t.close}</button>
      </div>
    </div>
  )
}
