/**
 * EOS — Global store (zustand)
 */

import { create } from 'zustand'
import type { Mode, ModelSpec, IntelligenceOutput } from '../eos-intelligence-layer'

interface EOSState {
  mode: Mode
  modelReady: boolean
  selectedModel: ModelSpec | null
  lastOutput: IntelligenceOutput | null
  bearerToken: string | null

  setMode: (m: Mode) => void
  setModelReady: (ready: boolean, spec?: ModelSpec | null) => void
  setLastOutput: (o: IntelligenceOutput | null) => void
  setBearerToken: (token: string | null) => void
}

export const useEOSStore = create<EOSState>((set) => ({
  mode: 'SURVIVAL',
  modelReady: false,
  selectedModel: null,
  lastOutput: null,
  bearerToken: null,

  setMode: (m) => set({ mode: m }),
  setModelReady: (ready, spec) =>
    set({
      modelReady: ready,
      selectedModel: spec ?? null,
    }),
  setLastOutput: (o) => set({ lastOutput: o }),
  setBearerToken: (token) => set({ bearerToken: token }),
}))
