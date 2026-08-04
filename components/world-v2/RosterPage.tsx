'use client'

/**
 * Cadastro da família — reconstruído no design system do app (D-122).
 *
 * ESTA TELA ERA UM VAZAMENTO. A aba Família manda o usuário para cá em
 * "Cadastrar" e em "Editar cadastro" — ou seja, é a ação primária da aba. E o
 * que ele encontrava era outro aplicativo: verde neon, mono em caixa alta,
 * botões cortados em paralelogramo, e **três controles que mentiam** — um
 * hambúrguer que não abria nada, um sino com bolinha vermelha permanente e uma
 * pílula "CONNECTED · Family Grid" que não media conexão nenhuma. Sem botão de
 * voltar. Erro em `alert()` do navegador.
 *
 * O QUE FOI CORTADO, E POR QUÊ. A tela abria com "SECURITY SCORE 00", três
 * mostradores e um feed de 24 horas — um painel de métricas antes da tarefa. A
 * pergunta que se faz aqui é **"meu cadastro está completo?"**, não "qual é o
 * meu score". O score já existe na aba Família, que é onde ele decide algo.
 *
 * O QUE ENTROU NO LUGAR: o que falta em cada pessoa, dito na cara. O EOS
 * calcula água, comida e rota POR PESSOA — uma idade em branco não é um campo
 * vazio, é uma conta errada. Essa é a única razão desta tela existir, então é
 * ela que ocupa o topo.
 *
 * Controle decorativo é mentira: aqui todo controle faz o que promete, e o
 * caminho de volta está sempre visível.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import NumericStepper from '@/components/NumericStepper'
import QRScanner from '@/components/QRScanner'
import { parseScannedValue } from '@/lib/qr-parse'
import { useLanguage } from '@/lib/i18n'
import { Card, Pill, SectionLabel } from './primitives'
import { haptic } from './motion'
import './world-v2.css'

type Member = {
  id: string
  name: string
  age: number | null
  medical_conditions: string[]
  medical_notes: string | null
  medications: string[]
  mobility_impaired: boolean
  is_infant: boolean
  linked_user_id: string | null
}

type CircleCandidate = { user_id: string; name: string; circleName: string }

type Form = {
  name: string
  age: number | null
  medical_conditions: string[]
  medical_notes: string
  medications: string[]
  mobility_impaired: boolean
  is_infant: boolean
}

const EMPTY: Form = {
  name: '',
  age: null,
  medical_conditions: [],
  medical_notes: '',
  medications: [],
  mobility_impaired: false,
  is_infant: false,
}

const COPY = {
  pt: {
    back: 'Família',
    eyebrow: 'Cadastro',
    title: 'Quem mora aqui',
    lead: 'O EOS calcula água, comida e rota por pessoa. O que faltar aqui, falta na conta.',
    people: 'pessoas',
    person: 'pessoa',
    complete: 'cadastro completo',
    incomplete: 'com informação faltando',
    add: 'Adicionar pessoa',
    scan: 'Ler ficha por QR',
    empty: 'Ninguém cadastrado ainda',
    emptyWhy: 'Enquanto o EOS não souber quem mora aqui, todo cálculo de autonomia está errado — para mais ou para menos.',
    listLabel: 'Pessoas da casa',
    circleLabel: 'Contas no seu círculo',
    circleWhy: 'Estas pessoas têm conta no EOS. Vincular une o cadastro à conta: a pessoa passa a aparecer no mapa como a mesma pessoa, não como duas.',
    link: 'Vincular',
    linked: 'Vinculado à conta',
    unlink: 'Desvincular',
    missing: 'Falta',
    missingAge: 'idade',
    missingHealth: 'informação de saúde',
    nothingMissing: 'Completo',
    year: 'ano',
    years: 'anos',
    noAge: 'idade não informada',
    meds: 'remédio',
    medsPlural: 'remédios',
    conditions: 'condição',
    conditionsPlural: 'condições',
    edit: 'Editar',
    // sheet
    newTitle: 'Nova pessoa',
    editTitle: 'Editar pessoa',
    close: 'Fechar',
    name: 'Nome',
    namePlaceholder: 'Como você chama essa pessoa',
    nameRequired: 'O nome é obrigatório.',
    age: 'Idade',
    ageWhy: 'A idade muda a conta de água e o tempo de caminhada no plano.',
    clearAge: 'Deixar em branco',
    health: 'Saúde',
    healthPlaceholder: 'Ex.: diabetes tipo 2, usa insulina; asma leve no inverno',
    healthWhy: 'Escreva com suas palavras. O EOS sugere as etiquetas.',
    suggest: 'Sugerir etiquetas',
    analyzing: 'Lendo…',
    tagsHint: 'Toque para incluir ou remover:',
    medications: 'Medicamentos',
    medPlaceholder: 'Nome do remédio',
    addMed: 'Incluir',
    special: 'Situações que mudam o plano',
    mobility: 'Não se desloca sozinho',
    mobilityWhy: 'O plano passa a contar com alguém para buscar essa pessoa.',
    infant: 'Bebê em casa',
    infantWhy: 'Muda a conta de água e a lista de itens essenciais.',
    save: 'Salvar',
    create: 'Cadastrar',
    saving: 'Salvando…',
    remove: 'Excluir do cadastro',
    removeAsk: 'Excluir mesmo? Isso refaz as contas de autonomia.',
    removeYes: 'Sim, excluir',
    removeNo: 'Manter',
    saveError: 'Não foi possível salvar.',
    loadError: 'Não foi possível carregar o cadastro.',
    retry: 'Tentar de novo',
    scanTitle: 'Ler ficha de emergência',
    scanHint: 'Aponte para o QR da ficha da pessoa. Os dados públicos preenchem o cadastro, e você confere antes de salvar.',
    scanWrong: 'Esse QR não é uma ficha de emergência do EOS.',
    scanNotFound: 'Ficha não encontrada.',
    bloodType: 'Tipo sanguíneo',
    allergies: 'Alergias',
  },
  en: {
    back: 'Family',
    eyebrow: 'Records',
    title: 'Who lives here',
    lead: 'EOS computes water, food and routes per person. Whatever is missing here is missing from the maths.',
    people: 'people',
    person: 'person',
    complete: 'complete',
    incomplete: 'with information missing',
    add: 'Add a person',
    scan: 'Scan an emergency card',
    empty: 'Nobody recorded yet',
    emptyWhy: 'Until EOS knows who lives here, every autonomy figure is wrong — too high or too low.',
    listLabel: 'People in the household',
    circleLabel: 'Accounts in your circle',
    circleWhy: 'These people have an EOS account. Linking joins the record to the account, so they appear on the map as one person instead of two.',
    link: 'Link',
    linked: 'Linked to account',
    unlink: 'Unlink',
    missing: 'Missing',
    missingAge: 'age',
    missingHealth: 'health information',
    nothingMissing: 'Complete',
    year: 'year',
    years: 'years',
    noAge: 'age not recorded',
    meds: 'medication',
    medsPlural: 'medications',
    conditions: 'condition',
    conditionsPlural: 'conditions',
    edit: 'Edit',
    newTitle: 'New person',
    editTitle: 'Edit person',
    close: 'Close',
    name: 'Name',
    namePlaceholder: 'What you call this person',
    nameRequired: 'A name is required.',
    age: 'Age',
    ageWhy: 'Age changes the water maths and the walking time in the plan.',
    clearAge: 'Leave blank',
    health: 'Health',
    healthPlaceholder: 'e.g. type 2 diabetes, uses insulin; mild asthma in winter',
    healthWhy: 'Write it in your own words. EOS suggests the tags.',
    suggest: 'Suggest tags',
    analyzing: 'Reading…',
    tagsHint: 'Tap to include or remove:',
    medications: 'Medications',
    medPlaceholder: 'Medication name',
    addMed: 'Add',
    special: 'Situations that change the plan',
    mobility: 'Cannot move unaided',
    mobilityWhy: 'The plan will count on someone to collect this person.',
    infant: 'Infant at home',
    infantWhy: 'Changes the water maths and the essentials list.',
    save: 'Save',
    create: 'Add',
    saving: 'Saving…',
    remove: 'Delete record',
    removeAsk: 'Delete for good? This redoes the autonomy maths.',
    removeYes: 'Yes, delete',
    removeNo: 'Keep',
    saveError: 'Could not save.',
    loadError: 'Could not load the records.',
    retry: 'Try again',
    scanTitle: 'Scan emergency card',
    scanHint: 'Point at the person’s emergency QR. Public data fills the form and you review it before saving.',
    scanWrong: 'That QR is not an EOS emergency card.',
    scanNotFound: 'Card not found.',
    bloodType: 'Blood type',
    allergies: 'Allergies',
  },
} as const

/**
 * O que falta nesta pessoa para as contas ficarem certas.
 *
 * Não é validação de formulário: é a razão da tela. Uma idade em branco não é
 * um campo vazio, é um cálculo de autonomia errado — e o usuário só age sobre
 * isso se alguém disser.
 */
function faltando(m: Member, c: { missingAge: string; missingHealth: string }): string[] {
  const gaps: string[] = []
  if (m.age === null) gaps.push(c.missingAge)
  if (!m.medical_conditions.length && !m.medications.length && !m.medical_notes) gaps.push(c.missingHealth)
  return gaps
}

export default function RosterPage() {
  const { language } = useLanguage()
  const c = COPY[language]

  const [members, setMembers] = useState<Member[]>([])
  const [candidates, setCandidates] = useState<Record<string, CircleCandidate>>({})
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [formError, setFormError] = useState<string | null>(null)
  const [suggested, setSuggested] = useState<string[]>([])
  const [suggesting, setSuggesting] = useState(false)
  const [medInput, setMedInput] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [fam, circles] = await Promise.all([
        fetch('/api/family-members').then(r => (r.ok ? r.json() : null)),
        fetch('/api/circles').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ])
      if (!fam) throw new Error('family-members indisponível')
      setMembers(Array.isArray(fam.members) ? fam.members : [])

      const found: Record<string, CircleCandidate> = {}
      for (const circ of circles?.circles ?? []) {
        for (const m of circ.members ?? []) {
          if (m.is_me || found[m.user_id]) continue
          found[m.user_id] = { user_id: m.user_id, name: m.name, circleName: circ.name }
        }
      }
      setCandidates(found)
      setLoadFailed(false)
    } catch {
      // Falar em vez de mostrar uma lista vazia: uma tela vazia por falha de
      // rede é indistinguível de uma casa sem ninguém cadastrado.
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  /**
   * Quanto o teclado está cobrindo.
   *
   * O botão de salvar mora no rodapé da folha — o mesmo lugar que o teclado
   * ocupa quando alguém está digitando o nome. `dvh` não encolhe com o teclado
   * no iOS, então a medição vem do `visualViewport`, que é quem sabe.
   */
  useEffect(() => {
    if (!sheetOpen || typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    const medir = () => {
      const coberto = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      document.documentElement.style.setProperty('--roster-keyboard', `${Math.round(coberto)}px`)
    }
    medir()
    vv.addEventListener('resize', medir)
    vv.addEventListener('scroll', medir)
    return () => {
      vv.removeEventListener('resize', medir)
      vv.removeEventListener('scroll', medir)
      document.documentElement.style.setProperty('--roster-keyboard', '0px')
    }
  }, [sheetOpen])

  const incompletos = useMemo(
    () => members.filter(m => faltando(m, c).length > 0).length,
    [members, c],
  )

  function openNew() {
    setForm(EMPTY)
    setSuggested([])
    setMedInput('')
    setEditingId(null)
    setFormError(null)
    setConfirmRemove(false)
    setSheetOpen(true)
  }

  function openEdit(m: Member) {
    setForm({
      name: m.name,
      age: m.age,
      medical_conditions: m.medical_conditions ?? [],
      medical_notes: m.medical_notes ?? '',
      medications: m.medications ?? [],
      mobility_impaired: m.mobility_impaired,
      is_infant: m.is_infant,
    })
    setSuggested(m.medical_conditions ?? [])
    setMedInput('')
    setEditingId(m.id)
    setFormError(null)
    setConfirmRemove(false)
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    setEditingId(null)
    setFormError(null)
    setConfirmRemove(false)
  }

  async function suggestTags() {
    const notes = form.medical_notes.trim()
    if (!notes) return
    setSuggesting(true)
    try {
      const res = await fetch('/api/family-members/suggest-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medical_notes: notes }),
      })
      if (res.ok) {
        const { tags } = (await res.json()) as { tags: string[] }
        setSuggested(tags)
        setForm(f => ({ ...f, medical_conditions: tags }))
      }
    } finally {
      setSuggesting(false)
    }
  }

  function addMed() {
    const med = medInput.trim()
    if (!med || form.medications.includes(med)) return
    haptic.impact()
    setForm(f => ({ ...f, medications: [...f.medications, med] }))
    setMedInput('')
  }

  function save() {
    if (!form.name.trim()) {
      setFormError(c.nameRequired)
      return
    }
    setFormError(null)
    startTransition(async () => {
      const url = editingId ? `/api/family-members/${editingId}` : '/api/family-members'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          age: form.age,
          medical_conditions: form.medical_conditions,
          medical_notes: form.medical_notes.trim() || null,
          medications: form.medications,
          mobility_impaired: form.mobility_impaired,
          is_infant: form.is_infant,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setFormError(data.error ?? c.saveError)
        return
      }
      const data = await res.json()
      setMembers(cur =>
        editingId ? cur.map(m => (m.id === editingId ? data.member : m)) : [...cur, data.member],
      )
      closeSheet()
    })
  }

  function remove() {
    if (!editingId) return
    startTransition(async () => {
      const res = await fetch(`/api/family-members/${editingId}`, { method: 'DELETE' })
      if (res.ok || res.status === 204) {
        setMembers(cur => cur.filter(m => m.id !== editingId))
        closeSheet()
      } else {
        setFormError(c.saveError)
      }
    })
  }

  const setLink = async (memberId: string, userId: string | null) => {
    haptic.impact()
    await fetch(`/api/family-members/${memberId}/link`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linked_user_id: userId }),
    })
    await load()
  }

  /** Ficha lida por QR pré-preenche o formulário — a pessoa confere e salva. */
  async function onScan(text: string) {
    setScanOpen(false)
    setScanError(null)
    const parsed = parseScannedValue(text)
    if (parsed.type !== 'ficha') {
      setScanError(c.scanWrong)
      return
    }
    try {
      const res = await fetch('/api/profile/ficha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parsed.id }),
      })
      const j = await res.json()
      if (!res.ok || !j.ficha) {
        setScanError(c.scanNotFound)
        return
      }
      const f = j.ficha as {
        name?: string
        blood_type?: string | null
        allergies?: string[]
        medical_notes?: string | null
        medications?: string[]
      }
      const partes: string[] = []
      if (f.blood_type) partes.push(`${c.bloodType}: ${f.blood_type}`)
      if (f.allergies?.length) partes.push(`${c.allergies}: ${f.allergies.join(', ')}`)
      if (f.medical_notes) partes.push(f.medical_notes)
      setForm({ ...EMPTY, name: f.name ?? '', medical_notes: partes.join(' · '), medications: f.medications ?? [] })
      setSuggested([])
      setEditingId(null)
      setFormError(null)
      setSheetOpen(true)
    } catch {
      setScanError(c.scanNotFound)
    }
  }

  const naoVinculados = Object.values(candidates).filter(
    cand => !members.some(m => m.linked_user_id === cand.user_id),
  )

  return (
    <main className="wv2 wv2-roster-page">
      <div className="roster-scroll">
        {/* Wayfinding: o caminho de volta é a primeira coisa, sempre visível.
            A tela antiga não tinha nenhum — o usuário ficava preso. */}
        <Link href="/family" className="roster-back" onClick={() => haptic.impact()}>
          <span aria-hidden="true">‹</span> {c.back}
        </Link>

        <header className="roster-head">
          <p className="t-caps ink-3">{c.eyebrow}</p>
          <h1 className="roster-title">{c.title}</h1>
          <p className="t-body ink-2">{c.lead}</p>
          {!loading && members.length > 0 && (
            <p className="t-foot ink-3 roster-count">
              {members.length} {members.length === 1 ? c.person : c.people}
              {' · '}
              {incompletos === 0
                ? c.complete
                : `${incompletos} ${c.incomplete}`}
            </p>
          )}
        </header>

        {/* As ações ficam AQUI quando já existe gente, e dentro do cartão vazio
            quando não existe. A primeira versão mostrava as duas coisas ao mesmo
            tempo e "Adicionar pessoa" aparecia duas vezes na mesma tela — cada
            elemento precisa ganhar o seu lugar, e um botão repetido faz o
            usuário parar para descobrir se os dois fazem a mesma coisa. */}
        {!loading && !loadFailed && members.length > 0 && (
          <div className="roster-actions">
            <Pill primary onClick={openNew} disabled={isPending}>+ {c.add}</Pill>
            <Pill onClick={() => { setScanError(null); setScanOpen(true) }} disabled={isPending}>{c.scan}</Pill>
          </div>
        )}
        {scanError && <p className="t-foot warn" role="status">{scanError}</p>}

        {loading ? (
          <Card><p className="t-body ink-2">…</p></Card>
        ) : loadFailed ? (
          <Card>
            <p className="t-body">{c.loadError}</p>
            <Pill onClick={load}>{c.retry}</Pill>
          </Card>
        ) : members.length === 0 ? (
          <Card accented>
            <strong className="t-title2">{c.empty}</strong>
            <p className="t-body ink-2">{c.emptyWhy}</p>
            <div className="roster-actions">
              <Pill primary onClick={openNew}>+ {c.add}</Pill>
              <Pill onClick={() => { setScanError(null); setScanOpen(true) }}>{c.scan}</Pill>
            </div>
          </Card>
        ) : (
          <>
            <SectionLabel>{c.listLabel}</SectionLabel>
            {members.map(m => {
              const gaps = faltando(m, c)
              const linked = m.linked_user_id ? candidates[m.linked_user_id] : null
              const match = !m.linked_user_id
                ? Object.values(candidates).find(x => x.name.trim().toLowerCase() === m.name.trim().toLowerCase())
                : null
              return (
                <Card key={m.id} className="roster-person">
                  <div className="row">
                    <div className="id">
                      <strong className="t-title2">{m.name}</strong>
                      <em className="t-foot ink-2">
                        {m.age === null ? c.noAge : `${m.age} ${m.age === 1 ? c.year : c.years}`}
                        {m.medications.length > 0 &&
                          ` · ${m.medications.length} ${m.medications.length === 1 ? c.meds : c.medsPlural}`}
                        {m.medical_conditions.length > 0 &&
                          ` · ${m.medical_conditions.length} ${m.medical_conditions.length === 1 ? c.conditions : c.conditionsPlural}`}
                      </em>
                    </div>
                    <Pill onClick={() => openEdit(m)} disabled={isPending}>{c.edit}</Pill>
                  </div>

                  {(m.mobility_impaired || m.is_infant || m.medical_conditions.length > 0) && (
                    <div className="chips">
                      {m.mobility_impaired && <span className="wv2-chip on">{c.mobility}</span>}
                      {m.is_infant && <span className="wv2-chip on">{c.infant}</span>}
                      {m.medical_conditions.map(t => <span key={t} className="wv2-chip on">{t}</span>)}
                    </div>
                  )}

                  {/* A razão da tela: o que falta, dito na cara. */}
                  {gaps.length > 0 ? (
                    <p className="t-foot warn">{c.missing}: {gaps.join(', ')}</p>
                  ) : (
                    <p className="t-foot ok">{c.nothingMissing}</p>
                  )}

                  {linked && (
                    <div className="link-row">
                      <span className="t-foot ok">✓ {c.linked}</span>
                      <button type="button" className="roster-plain" onClick={() => setLink(m.id, null)}>
                        {c.unlink}
                      </button>
                    </div>
                  )}
                  {!linked && match && (
                    <div className="link-row suggest">
                      <span className="t-foot ink-2">{match.name} · {match.circleName}</span>
                      <Pill onClick={() => setLink(m.id, match.user_id)}>{c.link}</Pill>
                    </div>
                  )}
                </Card>
              )
            })}

            {naoVinculados.length > 0 && (
              <>
                <SectionLabel>{c.circleLabel}</SectionLabel>
                <Card>
                  <p className="t-foot ink-2">{c.circleWhy}</p>
                  <ul className="roster-candidates">
                    {naoVinculados.map(cand => (
                      <li key={cand.user_id} className="t-body">
                        <b>{cand.name}</b> <span className="ink-3">· {cand.circleName}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            )}
          </>
        )}
      </div>

      {sheetOpen && (
        <div
          className="roster-scrim"
          role="presentation"
          onClick={e => e.target === e.currentTarget && closeSheet()}
        >
          <div className="roster-sheet" role="dialog" aria-modal="true" aria-label={editingId ? c.editTitle : c.newTitle}>
            <div className="grab" aria-hidden="true" />
            <div className="sheet-head">
              <strong className="t-title2">{editingId ? c.editTitle : c.newTitle}</strong>
              <button type="button" className="roster-close" onClick={closeSheet} aria-label={c.close}>✕</button>
            </div>

            <div className="sheet-scroll">
              {formError && <p className="t-foot warn" role="alert">{formError}</p>}

              <label className="field">
                <span className="t-caps ink-3">{c.name}</span>
                <input
                  className="roster-input"
                  type="text"
                  value={form.name}
                  placeholder={c.namePlaceholder}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  disabled={isPending}
                  autoFocus
                />
              </label>

              <div className="field">
                <span className="t-caps ink-3">{c.age}</span>
                <NumericStepper
                  value={form.age ?? 0}
                  step={1}
                  min={0}
                  max={120}
                  decimals={0}
                  unit={c.years}
                  size="md"
                  disabled={isPending}
                  onChange={v => setForm(f => ({ ...f, age: v === 0 ? null : v }))}
                />
                <span className="t-foot ink-3">{c.ageWhy}</span>
                {form.age !== null && (
                  <button
                    type="button"
                    className="roster-plain"
                    onClick={() => setForm(f => ({ ...f, age: null }))}
                    disabled={isPending}
                  >
                    {c.clearAge}
                  </button>
                )}
              </div>

              <label className="field">
                <span className="t-caps ink-3">{c.health}</span>
                <textarea
                  className="roster-textarea"
                  rows={3}
                  value={form.medical_notes}
                  placeholder={c.healthPlaceholder}
                  onChange={e => setForm(f => ({ ...f, medical_notes: e.target.value }))}
                  onBlur={() => {
                    if (form.medical_notes.trim().length >= 15 && suggested.length === 0) void suggestTags()
                  }}
                  disabled={isPending}
                />
                <span className="t-foot ink-3">{c.healthWhy}</span>
              </label>

              <Pill
                onClick={suggestTags}
                disabled={isPending || suggesting || !form.medical_notes.trim()}
              >
                {suggesting ? c.analyzing : `✦ ${c.suggest}`}
              </Pill>

              {suggested.length > 0 && (
                <div className="field">
                  <span className="t-foot ink-3">{c.tagsHint}</span>
                  <div className="chips">
                    {suggested.map(tag => {
                      const on = form.medical_conditions.includes(tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          className={`wv2-chip${on ? ' on' : ''}`}
                          disabled={isPending}
                          onClick={() => {
                            haptic.impact()
                            setForm(f => ({
                              ...f,
                              medical_conditions: on
                                ? f.medical_conditions.filter(t => t !== tag)
                                : [...f.medical_conditions, tag],
                            }))
                          }}
                        >
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="field">
                <span className="t-caps ink-3">{c.medications}</span>
                <div className="med-row">
                  <input
                    className="roster-input"
                    type="text"
                    value={medInput}
                    placeholder={c.medPlaceholder}
                    onChange={e => setMedInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); addMed() }
                    }}
                    disabled={isPending}
                  />
                  <Pill onClick={addMed} disabled={isPending || !medInput.trim()}>{c.addMed}</Pill>
                </div>
                {form.medications.length > 0 && (
                  <ul className="med-list">
                    {form.medications.map(med => (
                      <li key={med}>
                        <span className="t-body">{med}</span>
                        <button
                          type="button"
                          className="roster-plain"
                          onClick={() => setForm(f => ({ ...f, medications: f.medications.filter(x => x !== med) }))}
                          disabled={isPending}
                          aria-label={`${c.close} ${med}`}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="field">
                <span className="t-caps ink-3">{c.special}</span>
                <Switch
                  on={form.mobility_impaired}
                  label={c.mobility}
                  hint={c.mobilityWhy}
                  disabled={isPending}
                  onToggle={() => setForm(f => ({ ...f, mobility_impaired: !f.mobility_impaired }))}
                />
                <Switch
                  on={form.is_infant}
                  label={c.infant}
                  hint={c.infantWhy}
                  disabled={isPending}
                  onToggle={() => setForm(f => ({ ...f, is_infant: !f.is_infant }))}
                />
              </div>

              {editingId && (
                /* Confirmação só aqui: excluir uma pessoa é destrutivo e
                   irreversível, e refaz as contas de autonomia. Em todo o resto
                   da tela a ação acontece direto — pedir confirmação para tudo
                   treina a pessoa a confirmar sem ler. */
                <div className="danger">
                  {!confirmRemove ? (
                    <button type="button" className="roster-danger" onClick={() => setConfirmRemove(true)} disabled={isPending}>
                      {c.remove}
                    </button>
                  ) : (
                    <>
                      <p className="t-foot warn">{c.removeAsk}</p>
                      <div className="danger-acts">
                        <button type="button" className="roster-danger" onClick={remove} disabled={isPending}>
                          {c.removeYes}
                        </button>
                        <Pill onClick={() => setConfirmRemove(false)} disabled={isPending}>{c.removeNo}</Pill>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="sheet-foot">
              <Pill primary wide onClick={save} disabled={isPending}>
                {isPending ? c.saving : editingId ? c.save : c.create}
              </Pill>
            </div>
          </div>
        </div>
      )}

      {scanOpen && (
        <QRScanner title={c.scanTitle} hint={c.scanHint} onScan={onScan} onClose={() => setScanOpen(false)} />
      )}
    </main>
  )
}

/**
 * Interruptor com o motivo ao lado.
 *
 * O rótulo diz o que é; a linha de baixo diz o que muda no plano. Um controle
 * que precisa de explicação em outro lugar tem mapeamento fraco — aqui a
 * explicação está encostada nele.
 */
function Switch({
  on,
  label,
  hint,
  disabled,
  onToggle,
}: {
  on: boolean
  label: string
  hint: string
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`roster-switch${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => { haptic.impact(); onToggle() }}
    >
      <span className="txt">
        <strong className="t-sub">{label}</strong>
        <span className="t-foot ink-3">{hint}</span>
      </span>
      <span className="track" aria-hidden="true"><i /></span>
    </button>
  )
}
