'use client'

/**
 * Um Pilot só, que atravessa a navegação (D-137).
 *
 * Existiam DUAS instâncias: uma dentro do `WorldV2` (dashboard) e outra dentro
 * do `PilotDock` (todas as outras telas). Cada uma com o próprio `messages`.
 *
 * O efeito prático, que o dono descreveu: a conversa não sobrevive a trocar de
 * página. Perguntar "quanto tempo aguentamos", ir até Preparação para conferir,
 * e voltar — e o Pilot não lembra de nada. Um copiloto que esquece ao virar a
 * cabeça não é um copiloto.
 *
 * Agora a conversa vive AQUI, no layout autenticado, que não desmonta ao
 * navegar. O dashboard não monta mais um Pilot próprio: ele só pede a este
 * para abrir, e a barra de busca manda a pergunta pelo mesmo caminho.
 *
 * O `onShowCourse` é o único comportamento que muda por tela — só o dashboard
 * tem mapa do EOS para desenhar o trajeto. Em vez de duas instâncias por causa
 * disso, a tela que tem mapa REGISTRA o que fazer; as outras não registram
 * nada, e o Pilot entrega o destino pelo deep-link do app de mapas.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { PilotDestination } from '@/app/api/pilot/chat/route'
import type { PilotContext } from './pilot-engine'

type Pergunta = { text: string; nonce: number }

type PilotApi = {
  open: boolean
  setOpen: (v: boolean) => void
  /** Abre e já manda a pergunta — o caminho da barra de busca. */
  ask: (question: string) => void
  /** A pergunta pendente, consumida pelo Pilot montado. */
  incoming: Pergunta | null
  /**
   * Quem tem mapa diz o que fazer com um destino. Devolve a função de
   * cancelamento, para a tela desregistrar ao sair — senão o dashboard antigo
   * continuaria recebendo trajetos depois de desmontado.
   */
  registerCourse: (fn: (d: PilotDestination) => void) => () => void
  showCourse: (d: PilotDestination) => void
  /**
   * A tela acrescenta o que só ela sabe (D-137).
   *
   * Os FATOS DA CASA são iguais em toda parte — casa, despensa, checklist,
   * autonomia — e vêm de `usePilotFacts`. Mas o dashboard tem coisas que
   * nenhuma outra tela tem: os abrigos já carregados, as posições da família no
   * mapa, o ciclone desenhado, o vento medido.
   *
   * Sem isto, unificar o Pilot o deixaria PIOR no dashboard: ele passaria a
   * ignorar dados que estavam na tela na frente da pessoa — a mesma armadilha
   * do D-079, quando o mapa desenhava o cone e o Pilot dizia não enxergar o
   * evento.
   *
   * O que a tela devolve é somado por cima da base. Ela desregistra ao sair,
   * senão o Pilot continuaria falando de abrigos de uma tela fechada.
   */
  registerContext: (fn: (base: PilotContext) => PilotContext) => () => void
  /** Aplica o enriquecimento da tela atual, se houver. */
  enrich: (base: PilotContext) => PilotContext
}

const Ctx = createContext<PilotApi | null>(null)

export function PilotProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [incoming, setIncoming] = useState<Pergunta | null>(null)
  const cursoRef = useRef<((d: PilotDestination) => void) | null>(null)
  /*
   * O enriquecimento fica em ESTADO, não em ref.
   *
   * A primeira versão usava um ref mais um contador de versão só para forçar o
   * memo a refazer — e o lint apontou o contador como dependência fantasma, com
   * razão: era um jeito torto de dizer "isto mudou". Em estado, a mudança se
   * propaga sozinha, e o dashboard não abre mais o Pilot sem os abrigos que
   * acabou de carregar.
   */
  const [enriquecedor, setEnriquecedor] = useState<((base: PilotContext) => PilotContext) | null>(null)

  const ask = useCallback((question: string) => {
    const limpo = question.trim()
    if (!limpo) return
    setOpen(true)
    // O nonce deixa a MESMA pergunta ser feita de novo. Sem ele, repetir a
    // dúvida não faria nada e pareceria que o app travou.
    setIncoming({ text: limpo, nonce: Date.now() })
  }, [])

  const registerCourse = useCallback((fn: (d: PilotDestination) => void) => {
    cursoRef.current = fn
    return () => {
      if (cursoRef.current === fn) cursoRef.current = null
    }
  }, [])

  const showCourse = useCallback((d: PilotDestination) => {
    cursoRef.current?.(d)
  }, [])

  const registerContext = useCallback((fn: (base: PilotContext) => PilotContext) => {
    // `() => fn` porque `useState` trata função como atualizador preguiçoso e
    // chamaria a nossa em vez de guardá-la.
    setEnriquecedor(() => fn)
    return () => setEnriquecedor((atual: ((b: PilotContext) => PilotContext) | null) => (atual === fn ? null : atual))
  }, [])

  const enrich = useCallback((base: PilotContext) => (enriquecedor ? enriquecedor(base) : base), [enriquecedor])

  const api = useMemo<PilotApi>(
    () => ({ open, setOpen, ask, incoming, registerCourse, showCourse, registerContext, enrich }),
    [open, ask, incoming, registerCourse, showCourse, registerContext, enrich],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

/**
 * Fora do provedor devolve um Pilot inerte em vez de estourar.
 *
 * Uma tela pública (login, convite) que importe algo desta árvore não pode
 * quebrar por causa de um provedor que não faz sentido ali.
 */
export function usePilot(): PilotApi {
  const ctx = useContext(Ctx)
  return (
    ctx ?? {
      open: false,
      setOpen: () => {},
      ask: () => {},
      incoming: null,
      registerCourse: () => () => {},
      showCourse: () => {},
      registerContext: () => () => {},
      enrich: (base: PilotContext) => base,
    }
  )
}
