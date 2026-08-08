'use client'

/**
 * useWorldData — the household side of the World v2 surface.
 *
 * Deliberately small: risk, weather and location come from RiskProvider, so this
 * only owns what the dashboard adds on top (reserves, people, checklist) plus
 * connectivity. Offline-tolerant by construction — a failed fetch leaves the
 * previous value in place rather than blanking the screen, because the numbers
 * on this screen are the ones that matter when the network is the thing that
 * broke.
 *
 * A CASA VEM DE `/api/household`, E NÃO DAQUI (D-134).
 *
 * Esta tela foi a última que sobrou do modelo antigo. Ela contava
 * `family_members` — a lista de DEPENDENTES — e chamava aquilo de "pessoas",
 * com mínimo 1. Na conta do dono isso dava **1**, enquanto a casa de verdade
 * tem **3** (ele, a Daniela e a Paola, confirmados no círculo).
 *
 * Duas consequências, e as duas foram relatadas por ele:
 *
 *   1. a autonomia desta tela dividia a água por 1 e não por 3, e somava só a
 *      despensa DELE — a de quem mora junto ficava de fora;
 *   2. o número saía daqui direto para o prompt do Pilot, ao lado da lista
 *      correta vinda do servidor. O modelo lia "Pessoas: 1" e logo abaixo três
 *      nomes, e passou a não afirmar quem mora na casa — que é exatamente a
 *      queixa "o Pilot insiste em não saber quem está morando em casa".
 *
 * `family_members` continua sendo lido, mas só como REDE DE SEGURANÇA: se o
 * servidor não conseguir montar a casa, é melhor um número velho e conhecido
 * que uma tela em branco. Quando isso acontece, `known` fica false e o guard
 * do Pilot traduz isso em WAIT, nunca em GO.
 */

import { useCallback, useEffect, useState } from 'react'

type FamilyMember = {
  age: number | null
  medical_conditions: string[] | null
  mobility_impaired: boolean | null
  is_infant: boolean | null
}

type Inventory = {
  water_liters: number
  food_days: number
  fuel_liters: number
  battery_percent: number
  has_medical_kit: boolean
  has_communication_device: boolean
}

/** O que `/api/household` devolve — a mesma casa que o Pilot e a Preparação leem. */
type CasaDaApi = {
  size: number
  known: boolean
  people: Array<{
    isInfant: boolean
    mobilityImpaired: boolean
    medicalConditions: string[]
    medications: string[]
  }>
  inventory: {
    waterLiters: number
    foodPersonDays: number
    fuelLiters: number
    batteryPercent: number
    hasMedicalKit: boolean
    hasCommunicationDevice: boolean
    contributors: number
  }
}

/**
 * Who the plan has to protect. The Pilot needs this: a readiness answer that
 * silently ignores an infant or a medication dependency is worse than one that
 * admits it does not know, so `known` is tracked explicitly.
 */
export type Household = {
  people: number
  hasInfants: boolean
  hasMedicalConditions: boolean
  mobilityImpaired: number
  /** False until the roster actually loaded — never assume "no vulnerabilities". */
  known: boolean
}

export type WorldData = {
  inventory: Inventory | null
  people: number
  household: Household
  checklistPct: number
  online: boolean
  waterDays: number
  foodDays: number
  powerDays: number
  fuelDays: number
  /** The binding constraint: the household lasts as long as its scarcest reserve. */
  autonomyDays: number
  refresh: () => void
}

/** Litres per person per day, and the battery/fuel horizons the v1 model used. */
const LITRES_PER_PERSON_DAY = 3
const BATTERY_FULL_DAYS = 3
const LITRES_PER_FUEL_DAY = 10

export function useWorldData(): WorldData {
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [household, setHousehold] = useState<Household>({
    people: 1,
    hasInfants: false,
    hasMedicalConditions: false,
    mobilityImpaired: 0,
    known: false,
  })
  const [checklistPct, setChecklistPct] = useState(0)
  const [online, setOnline] = useState(true)

  /** A despensa da CASA inteira, quando o servidor consegue somá-la. */
  const [casa, setCasa] = useState<CasaDaApi | null>(null)

  const refresh = useCallback(async () => {
    const [lar, inv, family, checklist] = await Promise.all([
      fetch('/api/household').catch(() => null),
      fetch('/api/inventory').catch(() => null),
      fetch('/api/family-members').catch(() => null),
      fetch('/api/checklist').catch(() => null),
    ])

    if (inv?.ok) {
      const data = (await inv.json().catch(() => null)) as { inventory?: Inventory } | null
      if (data?.inventory) setInventory(data.inventory)
    }

    /*
     * A casa manda. Só ela sabe somar o que está na conta de quem mora junto —
     * a RLS impede a tela de ler isso, e corretamente.
     */
    let casaValeu = false
    if (lar?.ok) {
      const data = (await lar.json().catch(() => null)) as CasaDaApi | null
      if (data?.known && data.size > 0) {
        casaValeu = true
        setCasa(data)
        setHousehold({
          people: data.size,
          hasInfants: data.people.some(p => p.isInfant),
          hasMedicalConditions: data.people.some(p => p.medicalConditions.length > 0 || p.medications.length > 0),
          mobilityImpaired: data.people.filter(p => p.mobilityImpaired).length,
          known: true,
        })
      }
    }

    // Rede de segurança, e SÓ isso: sem a casa, uma tela em branco seria pior
    // que um número antigo. `known` continua contando a verdade.
    if (!casaValeu && family?.ok) {
      const data = (await family.json().catch(() => null)) as { members?: FamilyMember[] } | null
      const members = data?.members
      if (members) {
        setHousehold({
          people: Math.max(1, members.length),
          hasInfants: members.some(m => m.is_infant === true || (typeof m.age === 'number' && m.age < 2)),
          hasMedicalConditions: members.some(
            m => Array.isArray(m.medical_conditions) && m.medical_conditions.length > 0,
          ),
          mobilityImpaired: members.filter(m => m.mobility_impaired === true).length,
          known: false,
        })
      }
    }
    if (checklist?.ok) {
      const data = (await checklist.json().catch(() => null)) as
        | { items?: Array<{ acquired: boolean }> }
        | null
      const items = data?.items
      if (items?.length) {
        setChecklistPct(Math.round((items.filter(item => item.acquired).length / items.length) * 100))
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  /*
   * As reservas da CASA, não as da minha conta (D-134).
   *
   * Esta tela dividia a MINHA água pelas MINHAS bocas e ignorava a despensa de
   * quem mora junto. Numa casa de três em que só uma conta tinha inventário, a
   * Preparação dizia uma coisa e o Mundo dizia outra — para a mesma família, no
   * mesmo minuto.
   *
   * `foodPersonDays` traz a unidade no nome porque somar `food_days` cru já
   * dobrou a autonomia uma vez: o campo da tela é "dias que a MINHA casa
   * aguenta", então virar pessoa-dia antes de somar não é detalhe.
   */
  const somaDaCasa = casa?.known ? casa.inventory : null
  const bocas = Math.max(1, household.people)

  const waterDays = somaDaCasa
    ? somaDaCasa.waterLiters / (LITRES_PER_PERSON_DAY * bocas)
    : inventory
      ? inventory.water_liters / (LITRES_PER_PERSON_DAY * bocas)
      : 0
  const foodDays = somaDaCasa ? somaDaCasa.foodPersonDays / bocas : inventory?.food_days ?? 0
  const powerDays = somaDaCasa
    ? (somaDaCasa.batteryPercent / 100) * BATTERY_FULL_DAYS
    : inventory
      ? (inventory.battery_percent / 100) * BATTERY_FULL_DAYS
      : 0
  const fuelDays = somaDaCasa
    ? somaDaCasa.fuelLiters / LITRES_PER_FUEL_DAY
    : inventory
      ? inventory.fuel_liters / LITRES_PER_FUEL_DAY
      : 0
  /*
   * Autonomia é SOBREVIVÊNCIA: água e comida (D-129).
   *
   * Esta linha dizia `min(água, comida, energia, combustível)`, e o
   * `lib/household.ts` dizia `min(água, comida)`. O dono abriu duas telas e viu
   * 0,3 dias numa e 2 dias na outra, para a mesma casa.
   *
   * O número desta tela era o errado, e de um jeito específico: a bateria dele
   * em 10% virava "a família aguenta 0,3 dias". Não aguenta 0,3 dias — ela fica
   * sem luz. Energia e combustível continuam logo abaixo, como barras próprias,
   * que é onde a informação é verdadeira.
   */
  const autonomyDays = somaDaCasa || inventory ? Math.max(0, Math.min(waterDays, foodDays)) : 0

  return {
    inventory,
    people: household.people,
    household,
    checklistPct,
    online,
    waterDays,
    foodDays,
    powerDays,
    fuelDays,
    autonomyDays,
    refresh: () => void refresh(),
  }
}
