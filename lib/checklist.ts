const DIACRITICS = /[̀-ͯ]/g
const NON_ALPHANUM = /[^a-z0-9]+/g
const MULTI_DASH = /-{2,}/g
const EDGE_DASH = /^-+|-+$/g

export function canonicalKey(rawName: string): string {
  if (!rawName) return ''
  return rawName
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(NON_ALPHANUM, '-')
    .replace(MULTI_DASH, '-')
    .replace(EDGE_DASH, '')
}

export type ChecklistTier = 'ESSENTIAL' | 'MODERATE' | 'EXCELLENT'

export interface ChecklistItem {
  name: string
  tier: ChecklistTier
  quantity: number
  unit?: string | null
  canonical_key: string
}

export interface ChecklistGenerateInput {
  kitType: string
  scenarioType?: string
  scenarioDescription?: string
  familySize: number
  hasChildren: boolean
  hasInfants: boolean
  hasElderly: boolean
  hasMedicalConditions: boolean
}

// ─── Kit definitions (for UI + prompt routing) ───────────────────────────────

export interface KitDef {
  type: string
  label: string
  icon: string
  color: string
  description: string
}

export const KITS: KitDef[] = [
  { type: 'GERAL',       label: 'Preparação Geral', icon: '🏠', color: '#6366f1', description: 'Estoque e suprimentos para emergências em casa' },
  { type: 'BUG_OUT',     label: 'Bug Out Bag',      icon: '🎒', color: '#ef4444', description: 'Mochila de 72h para evacuação rápida' },
  { type: 'ACAMPAMENTO', label: 'Acampamento',       icon: '🏕', color: '#22c55e', description: 'Equipamentos e suprimentos para camping' },
  { type: 'PESCA',       label: 'Pesca',             icon: '🎣', color: '#3b82f6', description: 'Kit completo para pescaria' },
  { type: 'CACA',        label: 'Caça',              icon: '🦌', color: '#f59e0b', description: 'Equipamentos para caça' },
]

// ─── Prompt builders per kit type ────────────────────────────────────────────

function familyContext(input: ChecklistGenerateInput): string {
  return `FAMÍLIA:
- Tamanho: ${input.familySize} pessoa(s)
- Tem crianças (<18): ${input.hasChildren}
- Tem bebês (<2): ${input.hasInfants}
- Tem idosos (>65): ${input.hasElderly}
- Tem condições médicas: ${input.hasMedicalConditions}`
}

const JSON_OUTPUT = `OUTPUT - responda APENAS com JSON válido, sem markdown fences:
{
  "items": [
    { "name": "Água engarrafada", "tier": "ESSENTIAL", "quantity": 6, "unit": "litros" },
    { "name": "Kit primeiros socorros", "tier": "ESSENTIAL", "quantity": 1, "unit": "unidade" }
  ]
}`

function buildEmergencyPrompt(input: ChecklistGenerateInput): string {
  const scenario = input.scenarioType ?? 'GENERAL'
  return `Você é o EOS — Emergency Operating System, planejador de preparação.

Gere um checklist de preparação em TRÊS TIERS para esta família.

${familyContext(input)}

CENÁRIO: ${scenario}
${input.scenarioDescription ? `Descrição: ${input.scenarioDescription}` : ''}

REGRAS:
1. ESSENTIAL: mínimo para sobreviver 72h (base FEMA/Cruz Vermelha)
2. MODERATE: autonomia confortável de 7 dias
3. EXCELLENT: resiliência de 30 dias, conforto e redundância
4. Quantidades calculadas para ${input.familySize} pessoa(s)
5. Unidades SI: litros, kg, unidades. Dinheiro em BRL.
6. IDIOMA: TODOS os nomes em português brasileiro (pt-BR). Nunca em espanhol ou inglês.
7. Água: 3,8L por pessoa por dia (Cruz Vermelha).
8. Bebês precisam de fórmula, fraldas, lenços. Idosos/doenças: medicamentos com buffer de 7 dias.

${JSON_OUTPUT}`
}

function buildBugOutPrompt(input: ChecklistGenerateInput): string {
  return `Você é o EOS — Emergency Operating System, especialista em bug out bags.

Gere um checklist para uma MOCHILA DE BUG OUT (evacuação rápida de 72h) para esta família.

${familyContext(input)}

CONCEITO: Bug Out Bag é para sair de casa em menos de 5 minutos em situação de emergência.

REGRAS:
1. ESSENTIAL: o mínimo absoluto que cabe em uma mochila — sobrevivência 72h
2. MODERATE: conforto e segurança para 5-7 dias de deslocamento
3. EXCELLENT: autossuficiência de 2 semanas, comunicação, navegação, defesa
4. Peso total ESSENTIAL não deve exceder 15kg por adulto
5. IDIOMA: TODOS os nomes em português brasileiro (pt-BR).
6. Inclua: água/filtro, comida, primeiro socorros, documentos, comunicação, ferramenta, abrigo

${JSON_OUTPUT}`
}

function buildCampingPrompt(input: ChecklistGenerateInput): string {
  return `Você é o EOS — Emergency Operating System, especialista em camping e vida ao ar livre.

Gere um checklist de CAMPING para esta família.

${familyContext(input)}

REGRAS:
1. ESSENTIAL: itens obrigatórios para qualquer acampamento seguro
2. MODERATE: conforto, cozinha, higiene completa
3. EXCELLENT: conforto máximo, entretenimento, backup de energia
4. IDIOMA: TODOS os nomes em português brasileiro (pt-BR).
5. Inclua: tenda, sleeping bag, isolante, cozinha, iluminação, higiene, vestuário, primeiros socorros

${JSON_OUTPUT}`
}

function buildFishingPrompt(input: ChecklistGenerateInput): string {
  return `Você é o EOS — Emergency Operating System, especialista em pesca.

Gere um checklist de PESCA completo para esta família.

${familyContext(input)}

REGRAS:
1. ESSENTIAL: equipamentos básicos para pescar com segurança
2. MODERATE: conforto, isca variada, equipamentos de apoio
3. EXCELLENT: equipamentos avançados, eletrônicos, conforto total
4. IDIOMA: TODOS os nomes em português brasileiro (pt-BR).
5. Inclua: vara, carretel, linhas, anzóis, iscas, caixa de pesca, puçá, isopor/gelo, EPIs
6. Considere segurança aquática: colete salva-vidas, lanternas, capa de chuva

${JSON_OUTPUT}`
}

function buildHuntingPrompt(input: ChecklistGenerateInput): string {
  return `Você é o EOS — Emergency Operating System, especialista em caça.

Gere um checklist de CAÇA para esta família/grupo.

${familyContext(input)}

REGRAS:
1. ESSENTIAL: equipamentos e segurança básica para caça
2. MODERATE: conforto no campo, equipamentos de apoio
3. EXCELLENT: equipamentos avançados, tecnologia, conforto total
4. IDIOMA: TODOS os nomes em português brasileiro (pt-BR).
5. Inclua: vestuário camuflado, calçado adequado, faca/facão, primeiros socorros, comunicação,
   processamento do animal, armazenamento, hidratação e alimentação para o dia

${JSON_OUTPUT}`
}

export function buildChecklistPrompt(input: ChecklistGenerateInput): string {
  switch (input.kitType) {
    case 'BUG_OUT':     return buildBugOutPrompt(input)
    case 'ACAMPAMENTO': return buildCampingPrompt(input)
    case 'PESCA':       return buildFishingPrompt(input)
    case 'CACA':        return buildHuntingPrompt(input)
    default:            return buildEmergencyPrompt(input)
  }
}
