'use client'

/**
 * Os fatos do Pilot — UM cálculo, em todo o app (D-137).
 *
 * O dono abriu o Pilot em duas telas, no mesmo minuto, e leu duas casas:
 *
 *   Comms:      "Não sei o suficiente"  · checklist 0%  · "falta a ficha"
 *   Dashboard:  "Nada urgente"          · checklist 88% · limitante 0.7d
 *
 * O motor é o mesmo (`pilot-engine.ts`); o que divergia era o que ele recebia.
 * Existiam TRÊS montagens do mesmo contexto, e as três discordavam:
 *
 *   `/api/household`   pessoas = círculo confirmado + dependentes; despensa
 *                      SOMADA da casa; autonomia = min(água, comida)
 *   `useWorldData`     lia a rota acima (corrigido no D-134)
 *   `PilotDock`        pessoas = `family_members.length`; despensa só da PRÓPRIA
 *                      conta; **autonomia = `food_days` cru**
 *
 * A última é a das telas onde o dono viu "não sei quem mora aí" — e o `known`
 * dela era `members.length > 0`, então uma casa sem dependentes cadastrados se
 * declarava desconhecida mesmo com três contas confirmadas morando juntas.
 *
 * Este arquivo passa a ser a única montagem. Quem quiser o Pilot pede os fatos
 * aqui; ninguém mais soma nada por conta própria.
 */

import { useCallback, useEffect, useState } from 'react'
import { WATER_LITERS_PER_PERSON_DAY } from '@/lib/units'

/** As mesmas constantes do resto do app. Duplicá-las já produziu duas contas. */
/** D-159: régua da FEMA, uma cópia só (lib/units.ts). */
const LITROS_POR_PESSOA_DIA = WATER_LITERS_PER_PERSON_DAY
const DIAS_DE_BATERIA_CHEIA = 3
const LITROS_POR_DIA_DE_COMBUSTIVEL = 10

export type PilotFacts = {
  household: {
    people: number
    hasInfants: boolean
    hasMedicalConditions: boolean
    mobilityImpaired: number
    known: boolean
  }
  inventory: {
    water_liters: number
    food_days: number
    fuel_liters: number
    battery_percent: number
    has_medical_kit: boolean
    has_communication_device: boolean
  } | null
  checklistPct: number
  waterDays: number
  foodDays: number
  powerDays: number
  fuelDays: number
  autonomyDays: number
  /** Quem mora na casa e ainda não está no EOS (D-130). */
  pendingNames: string[]
  refresh: () => Promise<void>
}

export const FATOS_VAZIOS: Omit<PilotFacts, 'refresh'> = {
  // `known: false` é o estado honesto antes da leitura. O guard traduz isso em
  // WAIT, nunca em GO — nunca uma tranquilização inventada.
  household: { people: 1, hasInfants: false, hasMedicalConditions: false, mobilityImpaired: 0, known: false },
  inventory: null,
  checklistPct: 0,
  waterDays: 0,
  foodDays: 0,
  powerDays: 0,
  fuelDays: 0,
  autonomyDays: 0,
  pendingNames: [],
}

type CasaDaApi = {
  size: number
  known: boolean
  people: Array<{ isInfant: boolean; mobilityImpaired: boolean; medicalConditions: string[]; medications: string[] }>
  inventory: {
    waterLiters: number; foodPersonDays: number; fuelLiters: number
    batteryPercent: number; hasMedicalKit: boolean; hasCommunicationDevice: boolean; contributors: number
  }
  pendingNames?: string[]
  autonomyDays?: number | null
}

/**
 * Lê a casa do servidor e devolve os fatos prontos.
 *
 * `enabled` existe porque o dock só monta o contexto quando o orbe é aberto: um
 * app de emergência não pode cobrar requisições de rede e bateria em toda tela
 * por uma conversa que talvez não aconteça.
 */
export function usePilotFacts(enabled: boolean): Omit<PilotFacts, 'refresh'> & { refresh: () => Promise<void> } {
  const [fatos, setFatos] = useState<Omit<PilotFacts, 'refresh'>>(FATOS_VAZIOS)

  const refresh = useCallback(async () => {
    const [lar, chk] = await Promise.all([
      fetch('/api/household').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/checklist').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ])

    const casa = lar as CasaDaApi | null
    const itens: Array<{ acquired: boolean }> = chk?.items ?? []
    const checklistPct = itens.length ? Math.round((itens.filter(i => i.acquired).length / itens.length) * 100) : 0

    if (!casa?.known || casa.size <= 0) {
      // Sem a casa, o honesto é dizer que não sabe — e NÃO cair num palpite de
      // "uma pessoa", que produziria uma autonomia inventada. O checklist vale
      // por si e continua.
      setFatos({ ...FATOS_VAZIOS, checklistPct })
      return
    }

    const bocas = Math.max(1, casa.size)
    const inv = casa.inventory

    /*
     * As mesmas fórmulas de `lib/household.ts`, sobre a despensa SOMADA.
     *
     * `foodPersonDays` traz a unidade no nome porque somar `food_days` cru já
     * dobrou a autonomia uma vez — e era exatamente o que o dock fazia:
     * `autonomyDays = food_days` da própria conta, sem dividir por ninguém e
     * sem olhar a água.
     */
    const waterDays = inv.waterLiters / (LITROS_POR_PESSOA_DIA * bocas)
    const foodDays = inv.foodPersonDays / bocas
    const powerDays = (inv.batteryPercent / 100) * DIAS_DE_BATERIA_CHEIA
    const fuelDays = inv.fuelLiters / LITROS_POR_DIA_DE_COMBUSTIVEL

    setFatos({
      household: {
        people: casa.size,
        hasInfants: casa.people.some(p => p.isInfant),
        hasMedicalConditions: casa.people.some(p => p.medicalConditions.length > 0 || p.medications.length > 0),
        mobilityImpaired: casa.people.filter(p => p.mobilityImpaired).length,
        known: true,
      },
      // A forma antiga do inventário, para as telas que ainda a leem — mas
      // preenchida com a soma da CASA, não com a despensa de uma conta só.
      inventory: {
        water_liters: inv.waterLiters,
        food_days: foodDays,
        fuel_liters: inv.fuelLiters,
        battery_percent: inv.batteryPercent,
        has_medical_kit: inv.hasMedicalKit,
        has_communication_device: inv.hasCommunicationDevice,
      },
      checklistPct,
      waterDays,
      foodDays,
      powerDays,
      fuelDays,
      /*
       * Autonomia é SOBREVIVÊNCIA: água e comida (D-129). Bateria e combustível
       * são capacidade — dizem o que a casa CONSEGUE FAZER, não quanto tempo
       * ela aguenta.
       */
      autonomyDays: Math.max(0, Math.min(waterDays, foodDays)),
      pendingNames: Array.isArray(casa.pendingNames) ? casa.pendingNames : [],
    })
  }, [])

  useEffect(() => {
    if (enabled) void refresh()
  }, [enabled, refresh])

  return { ...fatos, refresh }
}
