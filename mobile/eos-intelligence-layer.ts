/**
 * EOS — Intelligence Layer (production)
 *
 * Three-tier intelligence with graceful degradation:
 *   CONNECTED  →  remote /api/analyze (streaming)
 *   LOCAL_AI   →  on-device llama.rn model (GGUF)
 *   SURVIVAL   →  deterministic Rules Engine + embedded playbook
 *
 * Mode is chosen by ConnectivityService + ModelManager state, NOT by this
 * file. This module is pure orchestration.
 */

import { initLlama, type LlamaContext } from 'llama.rn'
import RNFS from 'react-native-fs'
import DeviceInfo from 'react-native-device-info'

// ─── Mode ────────────────────────────────────────────────────────────────────

export type Mode = 'CONNECTED' | 'LOCAL_AI' | 'LORA_MESH' | 'SURVIVAL'

export interface IntelligenceInput {
  scenarioType: string
  scenario: string
  familySize: number
  hasInfants: boolean
  hasMedicalConditions: boolean
  water_liters: number
  food_days: number
}

export interface IntelligenceOutput {
  mode: Mode
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  risks: string[]
  immediate_actions: string[]
  short_term_actions: string[]
  mid_term_actions: string[]
  rulesApplied: string[]
  rawText?: string
}

// ─── Model catalogue (GGUF URLs + RAM requirements) ──────────────────────────

export interface ModelSpec {
  id: 'llama-3.2-1b-q4' | 'llama-3.2-3b-q4' | 'phi-3.5-mini-q4'
  label: string
  sizeMB: number
  minRAMGB: number
  url: string
  fileName: string
}

export const MODELS: ModelSpec[] = [
  {
    id: 'llama-3.2-1b-q4',
    label: 'Llama 3.2 1B (fast, 2GB RAM)',
    sizeMB: 770,
    minRAMGB: 2,
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    fileName: 'llama-3.2-1b-q4.gguf',
  },
  {
    id: 'phi-3.5-mini-q4',
    label: 'Phi 3.5 mini (balanced, 3GB RAM)',
    sizeMB: 2300,
    minRAMGB: 3,
    url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
    fileName: 'phi-3.5-mini-q4.gguf',
  },
  {
    id: 'llama-3.2-3b-q4',
    label: 'Llama 3.2 3B (best, 4GB RAM)',
    sizeMB: 2100,
    minRAMGB: 4,
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    fileName: 'llama-3.2-3b-q4.gguf',
  },
]

export async function recommendModel(): Promise<ModelSpec> {
  const totalBytes = await DeviceInfo.getTotalMemory()
  const totalGB = totalBytes / (1024 ** 3)
  const candidates = MODELS.filter((m) => m.minRAMGB <= totalGB)
  return candidates.at(-1) ?? MODELS[0]
}

// ─── Model manager (download + load) ─────────────────────────────────────────

export class ModelManager {
  private ctx: LlamaContext | null = null
  private loadedModelId: string | null = null

  modelPath(spec: ModelSpec): string {
    return `${RNFS.DocumentDirectoryPath}/${spec.fileName}`
  }

  async isDownloaded(spec: ModelSpec): Promise<boolean> {
    return RNFS.exists(this.modelPath(spec))
  }

  async download(
    spec: ModelSpec,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const dest = this.modelPath(spec)
    if (await this.isDownloaded(spec)) return

    const { promise } = RNFS.downloadFile({
      fromUrl: spec.url,
      toFile: dest,
      progressInterval: 500,
      progress: (p) => {
        if (onProgress && p.contentLength > 0) {
          onProgress(Math.round((p.bytesWritten / p.contentLength) * 100))
        }
      },
    })
    const res = await promise
    if (res.statusCode !== 200) {
      await RNFS.unlink(dest).catch(() => undefined)
      throw new Error(`Model download failed (HTTP ${res.statusCode})`)
    }
  }

  async load(spec: ModelSpec): Promise<void> {
    if (this.ctx && this.loadedModelId === spec.id) return
    if (this.ctx) {
      await this.ctx.release()
      this.ctx = null
    }
    const path = this.modelPath(spec)
    if (!(await RNFS.exists(path))) {
      throw new Error('Model not downloaded')
    }
    this.ctx = await initLlama({
      model: path,
      n_ctx: 2048,
      n_gpu_layers: 0,
      n_threads: 4,
    })
    this.loadedModelId = spec.id
  }

  async isReady(): Promise<boolean> {
    return this.ctx !== null
  }

  async complete(systemPrompt: string, user: string): Promise<string> {
    if (!this.ctx) throw new Error('Model not loaded')
    const result = await this.ctx.completion({
      prompt: `<|system|>\n${systemPrompt}<|end|>\n<|user|>\n${user}<|end|>\n<|assistant|>\n`,
      n_predict: 700,
      temperature: 0.4,
      stop: ['<|end|>', '<|user|>'],
    })
    return result.text.trim()
  }

  async release(): Promise<void> {
    if (this.ctx) {
      await this.ctx.release()
      this.ctx = null
      this.loadedModelId = null
    }
  }
}

export const modelManager = new ModelManager()

// ─── Rules engine (mobile mirror of web) ─────────────────────────────────────

function evaluateRules(input: IntelligenceInput): IntelligenceOutput {
  const risks: string[] = []
  const immediate: string[] = []
  const rulesApplied: string[] = []
  let priority: IntelligenceOutput['priority'] = 'LOW'

  const waterPerPerson = input.water_liters / Math.max(1, input.familySize)
  if (waterPerPerson < 2) {
    priority = 'CRITICAL'
    risks.push('Água abaixo de 2L/pessoa — desidratação iminente')
    immediate.push('Buscar fonte de água potável ou iniciar racionamento a 1L/pessoa/dia')
    rulesApplied.push('WATER_CRITICAL')
  } else if (waterPerPerson < 4) {
    priority = 'HIGH'
    risks.push('Reserva de água insuficiente para 48h')
    immediate.push('Racionar água para máximo 2L/pessoa/dia e filtrar/ferver novas fontes')
    rulesApplied.push('WATER_LOW')
  }

  if (input.food_days < 1) {
    priority = 'CRITICAL'
    risks.push('Sem reserva de alimentos')
    immediate.push('Inventariar cozinha, priorizar proteínas e carboidratos duráveis')
    rulesApplied.push('FOOD_CRITICAL')
  } else if (input.food_days < 3) {
    priority = priority === 'LOW' ? 'HIGH' : priority
    risks.push('Menos de 3 dias de alimentos')
    rulesApplied.push('FOOD_LOW')
  }

  if (input.hasInfants) {
    priority = priority === 'LOW' ? 'HIGH' : priority
    risks.push('Bebês presentes — fórmula, fraldas, aquecimento críticos')
    immediate.push('Separar fórmula, fraldas e água estéril em kit dedicado')
    rulesApplied.push('INFANTS_PRESENT')
  }

  if (input.hasMedicalConditions) {
    priority = priority === 'LOW' ? 'HIGH' : priority
    risks.push('Condições médicas presentes')
    immediate.push('Separar medicações essenciais com 7 dias de reserva')
    rulesApplied.push('MEDICAL_CONDITIONS')
  }

  if (input.scenarioType === 'FALLOUT') {
    priority = 'CRITICAL'
    risks.push('Contaminação radiológica — abrigo imediato')
    immediate.push('Selar portas e janelas; desligar ventilação')
    rulesApplied.push('SCENARIO_FALLOUT')
  }

  if (rulesApplied.length === 0) {
    immediate.push('Monitorar situação e manter comunicação')
    rulesApplied.push('DEFAULT')
  }

  return {
    mode: 'SURVIVAL',
    priority,
    risks,
    immediate_actions: immediate,
    short_term_actions: [],
    mid_term_actions: [],
    rulesApplied,
  }
}

// ─── Prompt builder (mobile) ─────────────────────────────────────────────────

function buildPrompt(input: IntelligenceInput, rules: IntelligenceOutput): string {
  return [
    'You are EOS — Emergency Operating System.',
    `PRIORITY (locked): ${rules.priority}`,
    `Active rules: ${rules.rulesApplied.join(', ')}`,
    `Scenario: ${input.scenarioType} — ${input.scenario}`,
    `Family: ${input.familySize} people. Infants: ${input.hasInfants}. Medical: ${input.hasMedicalConditions}.`,
    `Water: ${input.water_liters}L. Food: ${input.food_days} days.`,
    '',
    'Return EXACTLY:',
    'PRIORITY: <LOW|MEDIUM|HIGH|CRITICAL>',
    'RISKS:',
    '- ...',
    'IMMEDIATE (15 min):',
    '- ...',
    'SHORT TERM (1 hour):',
    '- ...',
    'MID TERM (3 hours):',
    '- ...',
  ].join('\n')
}

function parseStructured(
  text: string,
  mode: Mode,
  rules: IntelligenceOutput,
): IntelligenceOutput {
  const list = (label: string): string[] => {
    const re = new RegExp(`${label}[:\\n]+([\\s\\S]*?)(?=\\n[A-Z]|$)`)
    const m = text.match(re)
    if (!m) return []
    return m[1]
      .split('\n')
      .map((l) => l.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean)
  }
  const pMatch = text.match(/PRIORITY:\s*(CRITICAL|HIGH|MEDIUM|LOW)/)
  const priority =
    (pMatch?.[1] as IntelligenceOutput['priority']) ?? rules.priority

  // Rules floor: LLM can never downgrade
  const order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
  const finalPriority =
    order[priority] >= order[rules.priority] ? priority : rules.priority

  return {
    mode,
    priority: finalPriority,
    risks: list('RISKS').length ? list('RISKS') : rules.risks,
    immediate_actions: list('IMMEDIATE').length
      ? list('IMMEDIATE')
      : rules.immediate_actions,
    short_term_actions: list('SHORT TERM'),
    mid_term_actions: list('MID TERM'),
    rulesApplied: rules.rulesApplied,
    rawText: text,
  }
}

// ─── Public orchestration ────────────────────────────────────────────────────

export interface IntelligenceLayerDeps {
  remoteApiUrl?: string
  bearerToken?: string
  currentMode: Mode
  onModeDowngrade?: (from: Mode, to: Mode) => void
}

export async function runIntelligence(
  input: IntelligenceInput,
  deps: IntelligenceLayerDeps,
): Promise<IntelligenceOutput> {
  const rules = evaluateRules(input)

  // 1. CONNECTED
  if (deps.currentMode === 'CONNECTED' && deps.remoteApiUrl && deps.bearerToken) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 25_000)
      const res = await fetch(`${deps.remoteApiUrl}/api/analyze`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deps.bearerToken}`,
        },
        body: JSON.stringify({
          scenario: input.scenario,
          scenarioType: input.scenarioType,
        }),
      })
      clearTimeout(t)
      if (res.ok) {
        // Non-streaming minimal path; in the RN app we consume the SSE stream.
        const text = await res.text()
        return parseStructured(text, 'CONNECTED', rules)
      }
      throw new Error(`HTTP ${res.status}`)
    } catch {
      deps.onModeDowngrade?.('CONNECTED', 'LOCAL_AI')
    }
  }

  // 2. LOCAL_AI
  if (
    (deps.currentMode === 'CONNECTED' || deps.currentMode === 'LOCAL_AI') &&
    (await modelManager.isReady())
  ) {
    try {
      const prompt = buildPrompt(input, rules)
      const text = await modelManager.complete(
        'Generate strict, numbered survival plans. No markdown.',
        prompt,
      )
      return parseStructured(text, 'LOCAL_AI', rules)
    } catch {
      deps.onModeDowngrade?.('LOCAL_AI', 'SURVIVAL')
    }
  }

  // 3. SURVIVAL (rules-only)
  return rules
}
