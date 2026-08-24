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

import { useState } from 'react'
import Link from 'next/link'
import { COUNTRIES, countryOf, formatAddress, isGeocodable, EMPTY_ADDRESS, type Address } from '@/lib/address'

type Morador = { name: string; hasPhone: boolean }

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
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  /** Quantas pessoas este salvamento mandou para a lista da casa. */
  const [foram, setForam] = useState(0)

  const pais = countryOf(a.country)
  const r = pais ? (pt ? pais.labels : pais.labelsEn) : null
  const campo = (k: keyof Address) => (v: string) => { setA(c => ({ ...c, [k]: v })); setOk(null) }

  const adicionar = () => {
    const limpo = nome.trim()
    if (!limpo) return
    if (moradores.some(m => m.name.toLowerCase() === limpo.toLowerCase())) { setNome(''); return }
    // "Tem celular" é o padrão porque é o caso comum — e porque o caminho do
    // convite é reversível, enquanto criar um dependente escreve um registro.
    setMoradores(c => [...c, { name: limpo, hasPhone: true }])
    setNome('')
  }

  const salvar = async () => {
    setSalvando(true)
    setErro(null)
    setOk(null)
    try {
      const res = await fetch('/api/household/address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: a, residents: moradores }),
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
      // Quem foi digitado aqui vai para a lista única (D-135 fase 2). Sem esta
      // frase, o nome sumia: a pessoa digitava a filha aqui e não a encontrava
      // na tela que promete listar quem mora na casa.
      setForam((j.pendingInvites ?? 0) + (j.dependents ?? 0))
      onSaved?.({ pendingInvites: j.pendingInvites ?? 0, dependents: j.dependents ?? 0, located: Boolean(j.located) })
      setMoradores([])
    } catch {
      setErro(pt ? 'Não foi possível salvar.' : 'Could not save.')
    } finally {
      setSalvando(false)
    }
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

              <div className="ha-row">
                <input
                  className="ha-input"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
                  placeholder={pt ? 'Nome completo' : 'Full name'}
                />
                <button type="button" className="ha-btn" onClick={adicionar} disabled={!nome.trim()}>
                  {pt ? 'Incluir' : 'Add'}
                </button>
              </div>

              <ul className="ha-list">
                {moradores.map((m, i) => (
                  <li key={m.name}>
                    <span className="ha-name">{m.name}</span>
                    {/*
                      A pergunta que decide tudo. Com celular a pessoa recebe um
                      convite e entra com a própria conta; sem celular ela vira
                      dependente sob os cuidados de quem preencheu.
                    */}
                    <span className="ha-choice">
                      <button
                        type="button"
                        className={`ha-chip${m.hasPhone ? ' on' : ''}`}
                        aria-pressed={m.hasPhone}
                        onClick={() => setMoradores(c => c.map((x, j) => j === i ? { ...x, hasPhone: true } : x))}
                      >
                        {pt ? 'Tem celular' : 'Has a phone'}
                      </button>
                      <button
                        type="button"
                        className={`ha-chip${!m.hasPhone ? ' on' : ''}`}
                        aria-pressed={!m.hasPhone}
                        onClick={() => setMoradores(c => c.map((x, j) => j === i ? { ...x, hasPhone: false } : x))}
                      >
                        {pt ? 'Não tem' : 'No phone'}
                      </button>
                    </span>
                    <button
                      type="button"
                      className="ha-remove"
                      onClick={() => setMoradores(c => c.filter((_, j) => j !== i))}
                      aria-label={pt ? `Remover ${m.name}` : `Remove ${m.name}`}
                    >
                      ✕
                    </button>
                    <span className="ha-what">
                      {m.hasPhone
                        ? (pt ? 'Recebe um convite para entrar com a conta dela.' : 'Gets an invite to join with their own account.')
                        : (pt ? 'Fica sob os seus cuidados — conta na casa, sem precisar de app.' : 'Stays under your care — counted in the household, no app needed.')}
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

          <button type="button" className="ha-btn primary" onClick={salvar} disabled={salvando || !isGeocodable(a)}>
            {salvando ? (pt ? 'Salvando…' : 'Saving…') : (pt ? 'Salvar endereço' : 'Save address')}
          </button>
        </>
      )}
    </div>
  )
}
