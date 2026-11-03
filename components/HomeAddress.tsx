'use client'

/**
 * Onde você mora, e quem mora com você (D-130).
 *
 * O endereço é o único lugar do app onde a pessoa já está pensando "minha
 * casa". Perguntar ali quem mais mora nela é muito melhor que uma tela de
 * cadastro separada — foi a ideia do dono, e é a parte forte dela.
 *
 * A BIFURCAÇÃO É O DESENHO INTEIRO. Um nome digitado não vira pessoa: vira
 * convite, se ela tem celular, ou dependente, se não tem. São as duas coisas
 * que já existem no modelo. Um nome solto seria um terceiro tipo, e foi
 * exatamente ele que o D-123 removeu quando o dono perguntou "por que eu tenho
 * que adicionar membros sendo que eles já fazem parte do círculo?".
 *
 * E o endereço nunca junta casas sozinho: dois vizinhos do mesmo prédio
 * escrevem o mesmo endereço, e somar a despensa de estranhos na autonomia da
 * família seria pior que não ter o campo.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { COUNTRIES, countryOf, formatAddress, isGeocodable, EMPTY_ADDRESS, type Address } from '@/lib/address'
import { findSimilar, normalizeName, type NamedPerson } from '@/lib/household-names'

/*
 * HOUSEHOLD-FIX-001 — o formulário que gerou quatro convites para duas pessoas.
 *
 * Depois de salvar, a lista esvaziava e nada mostrava quem já morava na casa.
 * A beta tester achou que não tinha salvado e digitou de novo, cada vez com
 * uma grafia ("Graziela", "Graziela Letteriello"). Agora:
 *
 *   1. quem já mora aqui aparece ACIMA do campo de nome (§3.1);
 *   2. nome parecido pergunta "é a mesma pessoa?" antes de entrar (§3.2);
 *   3. a pergunta do celular não sugere mais um campo de número (§3.3).
 */

type Morador = { name: string; usesApp: boolean; confirmDistinct?: boolean }

/** Alguém que já mora na casa, com o estado que a pessoa precisa ler. */
type JaMora = NamedPerson & { status?: 'pending' | 'sent' }

/** "É a mesma pessoa?" — o nome digitado e com quem ele se parece. */
type Pergunta = {
  morador: Morador
  parecidos: NamedPerson[]
  /** O servidor recusou mesmo com "é outra pessoa": grafia idêntica (E19). */
  identico?: boolean
}

export default function HomeAddress({
  initial,
  pt,
  onSaved,
}: {
  initial?: Partial<Address>
  pt: boolean
  /** Recebe o que foi guardado, para a tela decidir se oferece o círculo. */
  onSaved?: (r: { pendingInvites: number; dependents: number; located: boolean }) => void
}) {
  const [a, setA] = useState<Address>({ ...EMPTY_ADDRESS, ...initial })
  const [moradores, setMoradores] = useState<Morador[]>([])
  const [nome, setNome] = useState('')
  const [casa, setCasa] = useState<JaMora[]>([])
  const [casaFalhou, setCasaFalhou] = useState(false)
  const [pergunta, setPergunta] = useState<Pergunta | null>(null)
  /** Quem acabou de ser apontado como "é a mesma" — destacado por um instante. */
  const [destaque, setDestaque] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  /** Quantas pessoas este salvamento mandou para a lista da casa. */
  const [foram, setForam] = useState(0)

  const pais = countryOf(a.country)
  const r = pais ? (pt ? pais.labels : pais.labelsEn) : null
  const campo = (k: keyof Address) => (v: string) => { setA(c => ({ ...c, [k]: v })); setOk(null) }

  /**
   * Quem já mora aqui, nos três tipos (§3.1).
   *
   * Falhar não trava o formulário (E16): ele continua funcionando, avisa que
   * não conseguiu ver a lista, e o servidor aplica a regra de nome parecido
   * do mesmo jeito.
   */
  const carregarCasa = useCallback(async () => {
    try {
      const [convites, deps, h] = await Promise.all([
        fetch('/api/household/address').then(r => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch('/api/family-members').then(r => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch('/api/household').then(r => (r.ok ? r.json() : null)).catch(() => null),
      ])
      const lista: JaMora[] = []
      for (const p of (h?.people ?? []) as Array<{ userId: string | null; name: string; isMe: boolean }>) {
        if (p.userId && !p.isMe) lista.push({ kind: 'account', id: p.userId, name: p.name })
      }
      for (const d of (deps?.members ?? []) as Array<{ id: string; name: string; linked_user_id: string | null }>) {
        if (!d.linked_user_id) lista.push({ kind: 'dependent', id: d.id, name: d.name })
      }
      for (const c of (convites?.invites ?? []) as Array<{ id: string; name: string; status: 'pending' | 'sent' }>) {
        lista.push({ kind: 'invite', id: c.id, name: c.name, status: c.status })
      }
      setCasa(lista)
      setCasaFalhou(false)
    } catch {
      setCasaFalhou(true)
    }
  }, [])

  useEffect(() => { void carregarCasa() }, [carregarCasa])

  const destacar = (p: NamedPerson) => {
    const k = `${p.kind}:${p.id}`
    setDestaque(k)
    setTimeout(() => setDestaque(atual => (atual === k ? null : atual)), 2500)
  }

  const adicionar = () => {
    const limpo = nome.trim()
    if (!limpo) return
    // A lista ainda não salva também conta: digitar duas vezes antes de salvar
    // era o mesmo erro, só que mais rápido.
    const naoSalvos: NamedPerson[] = moradores.map((m, i) => ({ kind: m.usesApp ? 'invite' : 'dependent', id: `novo-${i}`, name: m.name }))
    const parecidos = findSimilar(limpo, [...casa, ...naoSalvos])
    // "Vai usar o EOS no próprio celular" é o padrão porque é o caso comum — e
    // porque o caminho do convite é reversível, enquanto criar um dependente
    // escreve um registro.
    const morador: Morador = { name: limpo, usesApp: true }
    if (parecidos.length) {
      setPergunta({ morador, parecidos })
      return
    }
    setMoradores(c => [...c, morador])
    setNome('')
  }

  /** Resposta a "é a mesma pessoa?". Nunca bloqueia: "outra" sempre inclui. */
  const responder = async (mesma: boolean) => {
    if (!pergunta) return
    const { morador, parecidos } = pergunta
    setPergunta(null)
    setNome('')
    if (mesma) {
      const salvo = parecidos.find(p => !p.id.startsWith('novo-'))
      if (salvo) destacar(salvo)
      return
    }
    const confirmado = { ...morador, confirmDistinct: true }
    // Veio do servidor (já tinha passado por "Salvar"): envia de novo só ele.
    if (pergunta.identico !== undefined) {
      await enviar([confirmado])
      return
    }
    setMoradores(c => [...c, confirmado])
  }

  const enviar = async (lista: Morador[]) => {
    setSalvando(true)
    setErro(null)
    setOk(null)
    try {
      const res = await fetch('/api/household/address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: a, residents: lista }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(
          j.error === 'migration_pending'
            ? (pt ? 'O banco ainda não tem os campos de endereço. Avise o responsável pelo app.' : 'The database does not have the address fields yet.')
            : (j.error ?? (pt ? 'Não foi possível salvar.' : 'Could not save.')),
        )
        return
      }
      setOk(
        j.located
          ? (pt ? 'Endereço salvo e localizado no mapa.' : 'Address saved and located on the map.')
          : (pt ? 'Endereço salvo. Não consegui achar o ponto no mapa — dá para marcar à mão no Plano.' : 'Address saved. I could not find the map point — you can pin it in the Plan.'),
      )
      setForam((j.pendingInvites ?? 0) + (j.dependents ?? 0))
      onSaved?.({ pendingInvites: j.pendingInvites ?? 0, dependents: j.dependents ?? 0, located: Boolean(j.located) })
      setMoradores([])

      /*
       * O servidor segurou alguém parecido com quem já mora aqui (§4.1). A
       * pergunta volta para a tela — o nome não some calado.
       */
      const segurados = (Array.isArray(j.skipped) ? j.skipped : []) as Array<{ name: string; matches: NamedPerson[] }>
      if (segurados.length) {
        const primeiro = segurados[0]
        const enviado = lista.find(m => normalizeName(m.name) === normalizeName(primeiro.name))
        setPergunta({
          morador: { name: primeiro.name, usesApp: enviado?.usesApp ?? true },
          parecidos: primeiro.matches,
          identico: Boolean(enviado?.confirmDistinct),
        })
      }
    } catch {
      setErro(pt ? 'Não foi possível salvar.' : 'Could not save.')
    } finally {
      setSalvando(false)
      // Quem foi incluído passa para a lista da casa, em vez de sumir (§3.1).
      void carregarCasa()
    }
  }

  const salvar = () => enviar(moradores)

  const estado = (p: JaMora): string => {
    if (p.kind === 'account') return pt ? 'tem conta no EOS' : 'has an EOS account'
    if (p.kind === 'dependent') return pt ? 'sob seus cuidados' : 'under your care'
    return p.status === 'sent'
      ? (pt ? 'convite enviado' : 'invite sent')
      : (pt ? 'convite não enviado' : 'invite not sent')
  }

  return (
    <div className="home-address">
      <label className="ha-field">
        <span className="ha-label">{pt ? 'País' : 'Country'}</span>
        <select className="ha-input" value={a.country} onChange={e => campo('country')(e.target.value)}>
          <option value="">{pt ? 'Escolha…' : 'Choose…'}</option>
          {COUNTRIES.map(c => (
            <option key={c.code} value={c.code}>{pt ? c.pt : c.en}</option>
          ))}
        </select>
      </label>

      {pais && r && (
        <>
          <label className="ha-field">
            <span className="ha-label">{r.line1}</span>
            <input className="ha-input" value={a.line1} onChange={e => campo('line1')(e.target.value)} placeholder="5851 Holmberg Rd" />
          </label>

          <label className="ha-field">
            <span className="ha-label">{r.unit}</span>
            <input className="ha-input" value={a.unit} onChange={e => campo('unit')(e.target.value)} placeholder="4124" />
            {/* O motivo do campo, dito onde ele é preenchido. */}
            <span className="ha-hint">
              {pt
                ? 'É o que separa a sua casa da do vizinho quando o prédio divide o mesmo número de rua.'
                : 'This is what separates your home from your neighbour’s when the building shares a street number.'}
            </span>
          </label>

          <div className="ha-row">
            <label className="ha-field">
              <span className="ha-label">{r.city}</span>
              <input className="ha-input" value={a.city} onChange={e => campo('city')(e.target.value)} placeholder="Parkland" />
            </label>
            <label className="ha-field ha-narrow">
              <span className="ha-label">{r.region}</span>
              {pais.regions ? (
                <select className="ha-input" value={a.region} onChange={e => campo('region')(e.target.value)}>
                  <option value="">—</option>
                  {pais.regions.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              ) : (
                <input className="ha-input" value={a.region} onChange={e => campo('region')(e.target.value)} />
              )}
            </label>
            <label className="ha-field ha-narrow">
              <span className="ha-label">{r.postal}</span>
              <input className="ha-input" value={a.postal} onChange={e => campo('postal')(e.target.value)} placeholder="33067" inputMode="numeric" />
            </label>
          </div>

          {formatAddress(a) && (
            <p className="ha-preview">{formatAddress(a)}</p>
          )}

          {/* ── Quem mais mora aqui ─────────────────────────────────────── */}
          {isGeocodable(a) && (
            <section className="ha-people">
              <strong className="ha-title">{pt ? 'Mais alguém mora neste endereço?' : 'Does anyone else live here?'}</strong>
              <p className="ha-hint">
                {pt
                  ? 'O EOS calcula água, comida e rota por pessoa. Quem falta aqui, falta na conta.'
                  : 'EOS computes water, food and routes per person. Whoever is missing here is missing from the maths.'}
              </p>

              {/* Quem já mora aqui — antes do campo, para ninguém redigitar (§3.1). */}
              {casa.length > 0 && (
                <div className="ha-house">
                  <span className="ha-label">{pt ? 'Já moram aqui' : 'Already living here'}</span>
                  <ul className="ha-house-list">
                    {casa.map(p => (
                      <li key={`${p.kind}:${p.id}`} className={destaque === `${p.kind}:${p.id}` ? 'on' : undefined}>
                        <span className="ha-name">{p.name}</span>
                        <span className="ha-state">{estado(p)}</span>
                      </li>
                    ))}
                  </ul>
                  <Link className="ha-manage" href="/family/cadastro">
                    {pt ? 'Corrigir ou remover alguém' : 'Fix or remove someone'}
                  </Link>
                </div>
              )}
              {casaFalhou && (
                <p className="ha-hint" role="status">
                  {pt ? 'Não consegui ver quem já mora aqui. Dá para incluir mesmo assim.' : 'I could not load who already lives here. You can still add people.'}
                </p>
              )}

              <div className="ha-row">
                <input
                  className="ha-input"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
                  placeholder={pt ? 'Nome completo' : 'Full name'}
                  disabled={Boolean(pergunta)}
                />
                <button type="button" className="ha-btn" onClick={adicionar} disabled={!nome.trim() || Boolean(pergunta)}>
                  {pt ? 'Incluir' : 'Add'}
                </button>
              </div>

              {/* "É a mesma pessoa?" — pergunta, nunca bloqueia (§3.2). */}
              {pergunta && (
                <div className="ha-ask" role="alertdialog" aria-live="assertive">
                  <strong className="ha-title">
                    {pergunta.identico
                      ? (pt ? `Já existe um convite chamado "${pergunta.parecidos[0]?.name ?? pergunta.morador.name}".` : `There is already an invite named "${pergunta.parecidos[0]?.name ?? pergunta.morador.name}".`)
                      : (pt ? `Já existe "${pergunta.parecidos[0].name}" na casa. É a mesma pessoa?` : `"${pergunta.parecidos[0].name}" is already in the household. Is it the same person?`)}
                  </strong>
                  {pergunta.identico ? (
                    <>
                      <p className="ha-hint">
                        {pt
                          ? 'Se forem duas pessoas, escreva algo que diferencie, como "Maria (mãe)".'
                          : 'If they are two people, add something that tells them apart, like "Maria (mother)".'}
                      </p>
                      <div className="ha-ask-acts">
                        <button type="button" className="ha-btn" onClick={() => { setNome(pergunta.morador.name); setPergunta(null) }}>
                          {pt ? 'Escrever de outro jeito' : 'Write it differently'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="ha-ask-acts">
                      <button type="button" className="ha-btn primary" onClick={() => void responder(true)}>
                        {pt ? 'É a mesma, não incluir' : 'Same person, don’t add'}
                      </button>
                      <button type="button" className="ha-btn" onClick={() => void responder(false)}>
                        {pt ? 'É outra pessoa, incluir' : 'Different person, add'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <ul className="ha-list">
                {moradores.map((m, i) => (
                  <li key={m.name}>
                    <span className="ha-name">{m.name}</span>
                    <button
                      type="button"
                      className="ha-remove"
                      onClick={() => setMoradores(c => c.filter((_, j) => j !== i))}
                      aria-label={pt ? `Remover ${m.name}` : `Remove ${m.name}`}
                    >
                      ✕
                    </button>
                    {/*
                      A pergunta que decide tudo (§3.3). "Tem celular?" fazia a
                      pessoa procurar onde digitar o número — que não existe, de
                      propósito: o convite é um link.
                    */}
                    <span className="ha-choice">
                      <button
                        type="button"
                        className={`ha-chip${m.usesApp ? ' on' : ''}`}
                        aria-pressed={m.usesApp}
                        onClick={() => setMoradores(c => c.map((x, j) => j === i ? { ...x, usesApp: true } : x))}
                      >
                        {pt ? 'Vai usar o EOS no próprio celular' : 'Will use EOS on their own phone'}
                      </button>
                      <button
                        type="button"
                        className={`ha-chip${!m.usesApp ? ' on' : ''}`}
                        aria-pressed={!m.usesApp}
                        onClick={() => setMoradores(c => c.map((x, j) => j === i ? { ...x, usesApp: false } : x))}
                      >
                        {pt ? 'Fica sob meus cuidados' : 'Stays under my care'}
                      </button>
                    </span>
                    <span className="ha-what">
                      {m.usesApp
                        ? (pt ? 'Você manda um link pelo WhatsApp. Não precisamos do número.' : 'You send a link by WhatsApp. We don’t need their number.')
                        : (pt ? 'Conta na casa, sem precisar do app.' : 'Counted in the household, no app needed.')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {erro && <p className="ha-error" role="alert">{erro}</p>}
          {ok && <p className="ha-ok" role="status">{ok}</p>}
          {/*
            Uma porta só (D-135 fase 2).

            Este campo é o MOMENTO certo de perguntar quem mora aqui — a pessoa
            já está pensando "minha casa". Mas ele não pode virar uma segunda
            lista: quem foi digitado aqui é gerido num lugar só, e a frase leva
            até lá em vez de deixar a pessoa procurando.
          */}
          {foram > 0 && (
            <p className="ha-ok" role="status">
              {pt
                ? `${foram} ${foram === 1 ? 'pessoa foi' : 'pessoas foram'} para a lista da casa. `
                : `${foram} ${foram === 1 ? 'person was' : 'people were'} added to the household list. `}
              <Link href="/family/cadastro">{pt ? 'Ver quem mora aqui' : 'See who lives here'}</Link>
            </p>
          )}

          <button type="button" className="ha-btn primary" onClick={() => void salvar()} disabled={salvando || !isGeocodable(a) || Boolean(pergunta)}>
            {salvando ? (pt ? 'Salvando…' : 'Saving…') : (pt ? 'Salvar endereço' : 'Save address')}
          </button>
        </>
      )}
    </div>
  )
}
