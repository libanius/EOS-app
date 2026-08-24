'use client'

/**
 * `/mais/treino` — a cabine do Simulador (NAV-T08 / D-184).
 *
 * Saiu de `/scenario`, que era destino de primeiro nível na barra global.
 * Ocupar slot de destino sempre foi erro de categoria: o Simulador não é um
 * LUGAR, é um MODO — `SimulationProvider` é global e faz o app inteiro se
 * comportar como se a situação fosse verdade.
 *
 * ── O que continua sendo página, e por quê ────────────────────────────────
 *
 * `docs/35` propôs que a configuração virasse overlay. Ela não virou, e é uma
 * divergência deliberada: são 568 linhas de briefing com campo de texto,
 * interpretação por IA e cinco painéis de revisão. Isso é uma página. Espremer
 * num overlay pioraria o celular sem tornar nada mais "modo" — o que faz o
 * Simulador ser modo é a faixa global, que já existe, já é impossível de
 * ignorar e já carrega a saída em qualquer tela.
 *
 * O endereço é o que estava errado, não a forma.
 */

import SimulatorPage from '@/components/world-v2/SimulatorPage'

export default function Page() {
  return <SimulatorPage />
}
