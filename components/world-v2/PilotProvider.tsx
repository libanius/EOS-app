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
   * D-139: contexto de tela é registro imperativo.
   *
   * Guardar isto em estado fez o dashboard e o provider se alimentarem em loop:
   * WorldV2 registrava um enriquecedor, o provider renderizava, o objeto `pilot`
   * mudava, e WorldV2 registrava de novo. O Pilot precisa LER a tela atual
   * quando responde; registrar a tela atual não pode redesenhar a app shell.
   */
  const enriquecedorRef = useRef<((base: PilotContext) => PilotContext) | null>(null)

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
    enriquecedorRef.current = fn
    return () => {
      if (enriquecedorRef.current === fn) enriquecedorRef.current = null
    }
  }, [])

  const enrich = useCallback((base: PilotContext) => {
    const enriquecedor = enriquecedorRef.current
    return enriquecedor ? enriquecedor(base) : base
  }, [])

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
