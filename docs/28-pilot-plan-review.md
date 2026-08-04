# 28 — Pilot Plan Review With Explicit Acceptance

> Status: IMPLEMENTED
> Date: 2026-08-03
> Decision: **D-096**
> Roadmap: **PLAN-T07**

---

## Intent

O Pilot pode ajudar a construir e revisar planos da família, mas não pode salvar
ou reescrever o plano sozinho. A regra operacional é a mesma de UPP-03: proposta
visível, confirmação explícita, persistência só depois da ação do usuário.

## Implemented Behavior

Em `/plan`, o bloco **Revisão do Pilot** avalia o rascunho atual e gera propostas
pequenas de elementos do plano:

- `trigger`: gatilhos observáveis prontos para o plano;
- `role`: responsabilidade sugerida para um membro do círculo quando existe
  lugar importante, como escola, sem responsável claro.

Cada proposta mostra tipo, título, motivo e o conteúdo que será aplicado. O
botão **Aplicar ao rascunho** altera apenas o estado local da tela. O plano só
persiste quando o usuário toca em **Salvar plano**, que continua versionando,
enviando push ao círculo e exigindo reconhecimento da nova versão.

## Non-Negotiables

- Sem escrita silenciosa.
- Sem coordenadas inventadas pelo Pilot.
- Sem rotas calculadas automaticamente dentro do plano autoral.
- Sem substituição do documento inteiro por saída de modelo.
- Sem salvar memória ou plano sem confirmação humana.

## Implementation Notes

- A lógica vive em `lib/plan-pilot-review.ts` para ser testável e reutilizável.
- A UI aplica elemento por elemento em `components/world-v2/PlanPage.tsx`.
- Propostas já aplicadas desaparecem porque a revisão é recalculada sobre o
  rascunho atual.
- A implementação atual é determinística. Quando houver uma evolução com modelo,
  o provider de AI deve continuar sendo OpenAI e o output precisa passar pela
  mesma camada de confirmação.

## Validation

- `npm run type-check`
- `npm test -- --runInBand lib/__tests__/plan-pilot-review.test.ts`
