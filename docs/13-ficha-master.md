# 13 — Ficha Master

> Spec da identidade central do usuário no EOS.
> Decisão principal: D-019. Tarefa: P2-T06.

---

## Objetivo

A Ficha Master é a única identidade do usuário logado no EOS. Ela não cria uma
entidade paralela ao perfil: consolida os campos existentes de `profiles` em uma
experiência única, editável progressivamente e reutilizada pelo Motor de Decisão,
checklists, QR de emergência e Círculos.

---

## Dados consolidados

| Grupo | Campos |
|---|---|
| Identidade | `name`, `location` |
| Emergência | `blood_type`, `allergies`, `medical_notes`, `medications` |
| Contato | `emergency_contact_name`, `emergency_contact_phone` |
| Compartilhamento | QR público em `/ficha/[id]` |

Não haverá tabela `master_profile`. A fonte de verdade continua sendo `profiles`.

---

## Experiência

1. Onboarding coleta apenas nome, localização e tamanho familiar estimado.
2. Após o onboarding, `/ficha` mostra a identidade completa.
3. O usuário pode completar ou editar qualquer seção progressivamente.
4. Uma barra de progresso informa a completude da ficha.
5. O QR público permanece disponível na própria Ficha Master.
6. Alterações são salvas automaticamente usando `/api/profile/ficha`.

---

## Cálculo de completude

São considerados sete sinais, com peso igual:

1. Nome
2. Localização
3. Tipo sanguíneo
4. Pelo menos uma informação médica: alergia, condição ou medicamento
5. Nome do contato de emergência
6. Telefone do contato de emergência
7. QR público disponível

`completion = sinais preenchidos / 7 × 100`, arredondado para inteiro.

---

## Contrato da API

`GET /api/profile/ficha` retorna todos os campos consolidados.

`PATCH /api/profile/ficha` aceita atualizações parciais de:

- `name`
- `location`
- `blood_type`
- `allergies`
- `medical_notes`
- `medications`
- `emergency_contact_name`
- `emergency_contact_phone`

Nome não pode ser vazio. Não há mudança de autenticação ou exposição pública:
`/ficha/[id]` continua retornando somente os campos de emergência já definidos.

---

## Critérios de aceite

- `/ficha` apresenta identidade e emergência em uma única tela.
- Nome e localização são editáveis na Ficha Master.
- A tela mostra progresso de preenchimento.
- O salvamento parcial persiste em `profiles`.
- O QR público continua funcionando.
- A interface funciona em PT/EN.
- Build e verificação de tipos passam.
