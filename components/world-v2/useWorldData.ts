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

  const refresh = useCallback(async () => {
    const [inv, family, checklist] = await Promise.all([
      fetch('/api/inventory').catch(() => null),
      fetch('/api/family-members').catch(() => null),
      fetch('/api/checklist').catch(() => null),
    ])

    if (inv?.ok) {
      const data = (await inv.json().catch(() => null)) as { inventory?: Inventory } | null
      if (data?.inventory) setInventory(data.inventory)
    }
    if (family?.ok) {
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
          known: true,
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

  const waterDays = inventory
    ? inventory.water_liters / (LITRES_PER_PERSON_DAY * household.people)
    : 0
  const foodDays = inventory?.food_days ?? 0
  const powerDays = inventory ? (inventory.battery_percent / 100) * BATTERY_FULL_DAYS : 0
  const fuelDays = inventory ? inventory.fuel_liters / LITRES_PER_FUEL_DAY : 0
  const autonomyDays = inventory
    ? Math.max(0, Math.min(waterDays, foodDays, powerDays, fuelDays))
    : 0

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
