'use client'

/**
 * `/comms` — a lista de conversas (COMMS-T12 / D-188).
 *
 * Antes esta rota era o chat inteiro empilhado com rádio e linha do tempo. Ela
 * passa a ser o que o nome diz: **a lista**. Cada linha é um thread com
 * endereço próprio em `/comms/[id]`.
 *
 * ── O link antigo não pode virar 404, e este caso é pior que os outros ────
 *
 * Os `href` das notificações estão **gravados no banco** apontando para
 * `/comms?view=chat&circleId=…&messageId=…`. Isso é histórico: não dá para
 * reescrever, e alguém pode tocar num aviso de semanas atrás. Por isso esta
 * tela ainda entende os parâmetros antigos e leva para a conversa certa.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n'
import CommsNav from '@/components/world-v2/CommsNav'
import { Card, PillLink, SectionLabel } from '@/components/world-v2/primitives'
import { conversationTitle, hasUnread, preview, type ConversationRow } from '@/lib/conversations'
import '@/components/world-v2/world-v2.css'

type Pessoa = { userId: string; name: string }

type Resposta = {
  conversations: ConversationRow[]
  circleNames: Record<string, string>
  people: Pessoa[]
  me: string
}

const COPY = {
  pt: {
    eyebrow: 'EOS · Comms',
    title: 'Conversas',
    loading: 'Carregando…',
    vazio: 'Nenhuma conversa ainda.',
    vazioPorque: 'A conversa do seu círculo aparece aqui. Toque numa pessoa da família para falar só com ela.',
    semCirculo: 'Você ainda não está num círculo',
    semCirculoPorque: 'Comms é conversa entre pessoas do mesmo círculo. Entre ou crie um para começar.',
    abrirCirculos: 'Abrir Círculos',
    grupo: 'Grupo',
    novaDireta: 'Falar com alguém',
    novaDiretaPorque: 'Toque num nome para abrir uma conversa só entre vocês dois.',
    abrindo: 'Abrindo…',
    semMensagem: 'Sem mensagens ainda',
    esconder: 'Esconder',
    escondida: 'Conversa escondida. Ela volta se chegar mensagem nova.',
    desfazer: 'Desfazer',
    erro: 'Não consegui carregar as conversas.',
    tentar: 'Tentar de novo',
  },
  en: {
    eyebrow: 'EOS · Comms',
    title: 'Chats',
    loading: 'Loading…',
    vazio: 'No conversations yet.',
    vazioPorque: 'Your circle chat shows up here. Tap someone in the family to talk one to one.',
    semCirculo: 'You are not in a circle yet',
    semCirculoPorque: 'Comms is between people in the same circle. Join or create one to start.',
    abrirCirculos: 'Open Circles',
    grupo: 'Group',
    novaDireta: 'Message someone',
    novaDiretaPorque: 'Tap a name to open a chat between just the two of you.',
    abrindo: 'Opening…',
    semMensagem: 'No messages yet',
    esconder: 'Hide',
    escondida: 'Chat hidden. It comes back if a new message arrives.',
    desfazer: 'Undo',
    erro: 'Could not load your conversations.',
    tentar: 'Try again',
  },
} as const

/** Hora curta para hoje, data curta para o resto — como a lista de referência. */
function quando(iso: string | null, idioma: 'pt' | 'en'): string {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  return mesmoDia
    ? d.toLocaleTimeString(idioma === 'pt' ? 'pt-BR' : 'en-US', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(idioma === 'pt' ? 'pt-BR' : 'en-US', { day: '2-digit', month: '2-digit' })
}

function Iniciais({ nome }: { nome: string }) {
  const letras = nome.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() || '—'
  return <span style={S.face} aria-hidden="true">{letras}</span>
}

function ListaConteudo() {
  const { language } = useLanguage()
  const c = COPY[language === 'en' ? 'en' : 'pt']
  const router = useRouter()
  const searchParams = useSearchParams()

  const [dados, setDados] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)
  const [escondida, setEscondida] = useState<string | null>(null)
  const [abrindo, setAbrindo] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/comms/conversations', { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      setDados(await r.json())
      setErro(false)
    } catch {
      setErro(true)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  /*
   * O redirecionamento dos links guardados no banco.
   *
   * `?view=timeline` vai para a rota da linha do tempo. `?circleId=` vai para a
   * conversa daquele círculo, levando junto o `messageId` — porque o aviso
   * apontava para UMA mensagem, e chegar na conversa sem destacá-la perderia
   * metade da informação.
   */
  useEffect(() => {
    const view = searchParams.get('view')
    if (view === 'timeline' || view === 'notifications') {
      router.replace('/comms/linha-do-tempo')
      return
    }
    const circleId = searchParams.get('circleId')
    if (!circleId || !dados) return
    const alvo = dados.conversations.find(x => x.circleId === circleId && x.kind === 'circle')
    if (!alvo) return
    const messageId = searchParams.get('messageId')
    router.replace(`/comms/${alvo.id}${messageId ? `?messageId=${encodeURIComponent(messageId)}` : ''}`)
  }, [searchParams, dados, router])

  const esconder = async (id: string) => {
    setEscondida(id)
    setDados(atual => atual ? { ...atual, conversations: atual.conversations.filter(x => x.id !== id) } : atual)
    await fetch('/api/comms/conversations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: id, hidden: true }),
    }).catch(() => {})
  }

  const desfazer = async () => {
    if (!escondida) return
    await fetch('/api/comms/conversations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: escondida, hidden: false }),
    }).catch(() => {})
    setEscondida(null)
    void carregar()
  }

  const linhas = useMemo(() => dados?.conversations ?? [], [dados])

  /*
   * Quem ainda não tem conversa aberta.
   *
   * Quem já tem aparece na lista de cima — repetir a pessoa nos dois lugares
   * faria a de baixo parecer um segundo caminho para outro lugar, e não é.
   */
  const semConversa = useMemo(() => {
    const jaTem = new Set(
      linhas.filter(x => x.kind === 'direct').flatMap(x => x.others.map(o => o.userId)),
    )
    return (dados?.people ?? []).filter(p => !jaTem.has(p.userId))
  }, [dados, linhas])

  const abrirDireta = async (pessoa: Pessoa) => {
    setAbrindo(pessoa.userId)
    const r = await fetch('/api/comms/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: pessoa.userId }),
    }).then(x => x.json()).catch(() => null)
    if (r?.conversation?.id) router.push(`/comms/${r.conversation.id}`)
    else { setAbrindo(null); setErro(true) }
  }

  return (
    <div className="wv2 wv2-list-page" data-risk="safe" data-ready="true">
      <div className="list-scroll">
        <header className="list-header">
          <p className="t-caps ink-3">{c.eyebrow}</p>
          <h1 className="list-title">{c.title}</h1>
        </header>

        <CommsNav />

        {escondida && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <p className="t-body ink-2" style={{ margin: 0 }}>{c.escondida}</p>
              <button type="button" className="wv2-pill" onClick={() => { void desfazer() }}>{c.desfazer}</button>
            </div>
          </Card>
        )}

        {carregando ? (
          <Card><p className="t-body ink-2" style={{ margin: 0 }}>{c.loading}</p></Card>
        ) : erro ? (
          <Card>
            <p className="t-body ink-2" style={{ margin: '0 0 0.75rem' }}>{c.erro}</p>
            <button type="button" className="wv2-pill" onClick={() => { setCarregando(true); void carregar() }}>{c.tentar}</button>
          </Card>
        ) : linhas.length === 0 ? (
          <Card accented>
            <SectionLabel>{c.semCirculo}</SectionLabel>
            <p className="t-body ink-2" style={{ margin: '0.75rem 0 1rem' }}>{c.semCirculoPorque}</p>
            <PillLink href="/family/circulos" primary>{c.abrirCirculos}</PillLink>
          </Card>
        ) : (
          <div style={S.lista}>
            {linhas.map(conversa => {
              const nome = conversationTitle(conversa, dados?.circleNames[conversa.circleId] ?? null)
                ?? (conversa.kind === 'circle' ? c.grupo : '—')
              const naoLida = hasUnread(conversa, dados?.me ?? '')
              const previa = preview(conversa.lastMessageBody)
              const autor = conversa.kind === 'circle' && conversa.lastMessageSenderName
                ? `${conversa.lastMessageSenderName}: `
                : ''
              return (
                <div key={conversa.id} style={S.linha}>
                  <Link href={`/comms/${conversa.id}`} style={S.alvo}>
                    <Iniciais nome={nome} />
                    <span style={S.texto}>
                      <span style={S.topo}>
                        <strong className="t-body" style={S.nome}>{nome}</strong>
                        <time className="t-caption ink-3" dateTime={conversa.lastMessageAt ?? undefined}>
                          {quando(conversa.lastMessageAt, language === 'en' ? 'en' : 'pt')}
                        </time>
                      </span>
                      <span style={S.baixo}>
                        <span className="t-foot ink-2" style={S.previa}>
                          {previa ? `${autor}${previa}` : c.semMensagem}
                        </span>
                        {naoLida && <span style={S.ponto} aria-label="não lida" />}
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => { void esconder(conversa.id) }}
                    style={S.esconder}
                    aria-label={`${c.esconder} — ${nome}`}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/*
          "Falar com alguém" (COMMS-T13 / D-193).
          A pergunta que a lista precisa responder para quem nunca conversou
          com ninguém. Sem isto, a conversa individual existia no servidor e não
          tinha nenhuma porta na interface.
        */}
        {!carregando && !erro && semConversa.length > 0 && (
          <div style={{ marginTop: '1.25rem' }}>
            <SectionLabel trailing={String(semConversa.length)}>{c.novaDireta}</SectionLabel>
            <p className="t-foot ink-3" style={{ margin: '0.35rem 0 0.75rem' }}>{c.novaDiretaPorque}</p>
            <div style={S.lista}>
              {semConversa.map(pessoa => (
                <button
                  key={pessoa.userId}
                  type="button"
                  onClick={() => { void abrirDireta(pessoa) }}
                  disabled={abrindo === pessoa.userId}
                  style={{ ...S.alvo, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
                >
                  <Iniciais nome={pessoa.name} />
                  <span style={S.texto}>
                    <strong className="t-body" style={S.nome}>{pessoa.name}</strong>
                    <span className="t-foot ink-3" style={S.previa}>
                      {abrindo === pessoa.userId ? c.abrindo : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ListaConteudo />
    </Suspense>
  )
}

const S: Record<string, React.CSSProperties> = {
  lista: { display: 'grid', gap: 2 },
  linha: { display: 'flex', alignItems: 'stretch', gap: 4 },
  alvo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    // 64px: a linha é o alvo inteiro, não só o nome. Numa emergência a pessoa
    // acerta a linha, não a palavra.
    minHeight: 64,
    padding: '10px 12px',
    borderRadius: 16,
    textDecoration: 'none',
    background: 'var(--fill-2, rgba(255,255,255,0.04))',
    border: '1px solid var(--sep, rgba(255,255,255,0.08))',
  },
  face: {
    flex: 'none',
    width: 44,
    height: 44,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 999,
    border: '1px solid var(--sep, rgba(255,255,255,0.12))',
    background: 'rgba(255,255,255,0.06)',
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.4,
  },
  texto: { display: 'grid', gap: 3, minWidth: 0, flex: 1 },
  topo: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  // `minWidth: 0` nos dois níveis: sem isso o flex recusa encolher e a prévia
  // empurra a hora para fora da tela em vez de cortar.
  nome: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  baixo: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 },
  previa: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ponto: { flex: 'none', width: 9, height: 9, borderRadius: 999, background: '#ff453a' },
  esconder: {
    flex: 'none',
    width: 44,
    borderRadius: 16,
    border: '1px solid var(--sep, rgba(255,255,255,0.08))',
    background: 'transparent',
    color: 'var(--ink-3, #8a8a9a)',
    fontSize: 15,
    cursor: 'pointer',
  },
}
