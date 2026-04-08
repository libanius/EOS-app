# SPEC — EOS Decision Engine: API + Streaming + UI
Version: 1.0 | Status: Ready | Author: Paulo Neto

---

## 1. Objetivo

Implementar o fluxo completo de orquestração do EOS em três camadas:
1. `app/api/analyze/route.ts` — endpoint de análise com orquestração completa
2. Streaming + error handling na API `/api/analyze`
3. `app/(app)/scenario/page.tsx` — UI do Decision Engine

---

## 2. SPEC A — `app/api/analyze/route.ts`

### Objetivo
Endpoint POST que orquestra autenticação, dados do perfil, Rules Engine, knowledge retrieval, LLM e persistência — retornando um `IntelligenceResponse` completo.

### Comportamento

**Fluxo obrigatório (nesta ordem exata):**
1. Autenticar via Supabase → 401 se não autenticado
2. Validar body `{ scenario: string, scenarioType: string }` → 400 se inválido
3. Buscar `profile + family_members + resource_inventory` do Supabase via `profile_id` do usuário autenticado
4. Executar `RulesEngine.evaluate({ scenario, profile, family, inventory })` — SEMPRE antes do LLM
5. Buscar top-5 chunks relevantes via `getRelevantChunks(scenario, scenarioType)`
6. Construir system prompt via `buildSystemPrompt(query, rulesResult, knowledgeChunks)`
7. Chamar Claude API (modelo: `claude-sonnet-4-20250514`, `max_tokens: 1500`)
8. Parsear resposta via `parseStructuredResponse(text, 'CONNECTED', rulesResult)`
9. Salvar `action_plan` no Supabase
10. Retornar `IntelligenceResponse`

### Data Contract

**Input (Request Body):**
```typescript
interface AnalyzeRequest {
  scenario: string       // Descrição do cenário (max 2000 chars)
  scenarioType: string   // 'hurricane'|'earthquake'|'fallout'|'pandemic'|'fire'|'flood'|'general'
}
```

**Output (Response Body):**
```typescript
interface IntelligenceResponse {
  mode: 'CONNECTED' | 'LOCAL_AI' | 'SURVIVAL'
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  risks: string[]
  immediate_actions: string[]    // Plano 15 min
  short_term_actions: string[]   // Plano 1 hora
  mid_term_actions: string[]     // Plano 3 horas
  rulesApplied: string[]         // Regras determinísticas que foram ativadas
  knowledgeSources: string[]     // Fontes da knowledge base usadas
  raw_text?: string              // Texto bruto do LLM (fallback)
  action_plan_id?: string        // UUID do registro salvo no Supabase
}
```

**Supabase Tables Lidas:**
- `profiles` — via `user_id` do auth
- `family_members` — via `profile_id`
- `resource_inventory` — via `profile_id`

**Supabase Table Escrita:**
- `action_plans` — `{ scenario_id, priority, risks, plan_15min, plan_1h, plan_3h, rules_applied, mode }`

### Regras de Negócio

- `RulesEngine.evaluate()` NUNCA é pulado, mesmo se o perfil estiver incompleto
- Se `rulesResult.priority === 'CRITICAL'`, adicionar aviso no system prompt
- Knowledge chunks com score < 0.7 são descartados
- O LLM NÃO pode override regras determinísticas (ex: água < 1 dia → CRITICAL permanece)
- `action_plan_id` é retornado mesmo se o save falhar (log do erro, não propaga)

### Critérios de Aceitação
- [ ] Retorna 401 quando não autenticado
- [ ] Retorna 400 quando body inválido ou campos ausentes
- [ ] `rulesResult` está presente em TODOS os responses
- [ ] `knowledgeSources` lista as fontes dos chunks usados
- [ ] `action_plan` é persistido no Supabase com todos os campos
- [ ] Response tem estrutura `IntelligenceResponse` válida em todos os cenários
- [ ] Claude API usa modelo `claude-sonnet-4-20250514` e `max_tokens: 1500`

### Fora do Escopo
- Rate limiting por usuário
- Cache de resultados por cenário
- Webhook de notificação
- Multi-profile support

---

## 3. SPEC B — Streaming + Error Handling

### Objetivo
Adicionar streaming de tokens e error handling com fallback determinístico à API `/api/analyze`.

### Comportamento

**Streaming Protocol:**
- Content-Type: `text/event-stream`
- Cada token: `data: {"token":"..."}\n\n`
- Ao finalizar: `data: {"done":true,"response":IntelligenceResponse}\n\n`
- Stream DEVE fechar após `done:true`

**Error Handling com Fallback:**

| Erro | Ação | Fallback |
|------|------|---------|
| Timeout > 30s | Abortar fetch | Retornar `SURVIVAL` mode com rules-only |
| Rate limit 429 | Retry 1x após 1000ms | Após 2 tentativas: fallback SURVIVAL |
| Parse error | Log interno | Retornar `raw_text` como `immediate_actions[0]` |
| Supabase down | Log interno | Continuar sem persistir; não retornar 500 |
| Network error | Log interno | Fallback SURVIVAL |

**Modo SURVIVAL (rules-only):**
```typescript
{
  mode: 'SURVIVAL',
  priority: rulesResult.priority,
  risks: rulesResult.risks,
  immediate_actions: rulesResult.actions,
  short_term_actions: [],
  mid_term_actions: [],
  rulesApplied: rulesResult.rulesApplied,
  knowledgeSources: ['Rules Engine (offline)']
}
```

**Cliente (scenario/page.tsx):**
- Usar `fetch()` + `ReadableStream` reader
- Cada `{"token":"..."}` → append ao buffer de display
- Ao receber `{"done":true}` → setar `response` completo no state
- Efeito typewriter: 12ms por char (simulado via buffer flush)

### Regras de Negócio
- NUNCA retornar HTTP 500 sem mensagem útil ao usuário
- Retry APENAS para 429 (rate limit), não para 4xx ou erros de parse
- Timeout de 30s é medido a partir do início do stream
- Se retry falhar, o fallback é imediato (sem segundo retry)

### Critérios de Aceitação
- [ ] Stream emite tokens individuais com estrutura `{"token":"..."}`
- [ ] Stream finaliza com `{"done":true,"response":{...}}`
- [ ] Timeout 30s → response em modo SURVIVAL (não 500)
- [ ] Rate limit 429 → retry após 1s → fallback se falhar
- [ ] Parse error → `immediate_actions` contém raw text, sem 500
- [ ] Cliente exibe tokens em tempo real sem re-render completo
- [ ] Badge de modo atualiza para SURVIVAL quando em fallback

### Fora do Escopo
- Reconnect automático do EventSource
- Compressão do stream
- Cancelamento do stream pelo cliente

---

## 4. SPEC C — `app/(app)/scenario/page.tsx`

### Objetivo
UI completa do Decision Engine: configuração de cenário à esquerda, output com typewriter à direita.

### Comportamento

**Layout:**
- Desktop (≥768px): 2 colunas, gap 24px, `grid-cols-[380px_1fr]`
- Mobile: stack vertical, coluna de config primeiro

**Painel Esquerdo — Configuração:**

1. **Chips de tipo de cenário** (single-select):
   - Opções: `Hurricane | Earthquake | Fallout | Pandemic | Fire | Flood | General`
   - Estado ativo: `.chip.on` (--ac bg, dark text)
   - Estado padrão: `.chip` (--sf2 bg, --bd border)
   - `General` selecionado por default

2. **Textarea de descrição:**
   - Placeholder: "Descreva sua situação atual..."
   - Min-height: 120px
   - Estilo: background --sf2, border --bd, color --tx, border-radius 10px, padding 12px
   - Focus ring: 1px solid --ac

3. **Botão "Generate Action Plan":**
   - Classes: `.btn .bp .bfull`
   - Desabilitado quando: textarea vazia OU loading em progresso
   - Ao clicar: chamar `/api/analyze` via stream

**Painel Direito — Output:**

*Estado: Aguardando*
- Texto centralizado: "Configure o cenário e clique em Generate"
- Cor: --mu, font-size 14px
- Sem spinner

*Estado: Loading*
- 4 dots animados com labels (blink, delay incremental de 0.3s cada):
  1. "Scanning threat vectors..."
  2. "Profiling family context..."
  3. "Cross-referencing protocols..."
  4. "Building action plan..."
- Cada dot: 8px, border-radius 50%, background --ac
- Label: 12px, color --mu, margin-left 8px

*Estado: Resultado*
- Typewriter: 12ms por char, `white-space: pre-wrap`
- Cursor: `▋` em --ac, pisca 1s, desaparece ao terminar
- Font: monospace stack
- Padding: 16px

**Abaixo do resultado:**

- **Badge de modo:** pill com cor
  - `CONNECTED`: bg rgba(0,229,160,.12), text --ac
  - `LOCAL AI`: bg rgba(255,185,60,.12), text #FFB347
  - `SURVIVAL`: bg rgba(255,107,107,.12), text --ac3

- **Lista colapsável de `rulesApplied`:**
  - Toggle com `▶ Rules Applied (N)` → expande para lista
  - Cada item: 12px, color --mu, bullet `·`

- **Badge de prioridade:**
  - `CRITICAL`: --ac3 (red)
  - `HIGH`: #FFB347 (amber)
  - `MEDIUM`: --ac2 (purple)
  - `LOW`: --ac (green)

### Data Contract
- Input para API: `{ scenario: string, scenarioType: string }`
- Output da API: `IntelligenceResponse` (via stream)
- Estado local: `status: 'idle' | 'loading' | 'streaming' | 'done' | 'error'`

### Regras de Negócio
- Typewriter começa ao receber primeiro token do stream
- Ao receber `done:true`, cursor desaparece após 800ms
- Erro de rede → toast "Falha na conexão. Usando modo offline." + badge SURVIVAL
- `rulesApplied` lista colapsada por default

### Critérios de Aceitação
- [ ] Chips de cenário com single-select funcional
- [ ] Textarea com validação (não vazia para submit)
- [ ] Loading state exibe 4 dots com blink e delay incremental
- [ ] Tokens aparecem em tempo real via stream
- [ ] Cursor ▋ pisca durante streaming, desaparece ao terminar
- [ ] Badge de modo reflete `IntelligenceResponse.mode`
- [ ] `rulesApplied` é colapsável e exibe contagem
- [ ] Badge de prioridade usa cor correta por nível
- [ ] Layout responsivo: 2 colunas desktop, stack mobile

### Fora do Escopo
- Histórico de análises
- Export do action plan como PDF
- Compartilhar análise com Circle
- Edição pós-geração
