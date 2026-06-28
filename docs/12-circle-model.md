# 12 — Circle Model Specification

> Spec completa do sistema de Círculos do EOS.
> Definida em sessão 2026-06-28. Deve ser lida antes de qualquer implementação de Círculos.

---

## Conceito central

O **Círculo** é o espaço compartilhado de preparação de uma família ou grupo.
Entrar num círculo = ter acesso imediato a tudo que o grupo já configurou.
Ninguém re-cadastra o que o líder já configurou.

---

## O que o círculo compartilha

Quando um membro entra no círculo, ele passa a ver:

| Dado | Quem pode ver | Quem pode editar |
|---|---|---|
| Membros da família | Todos | Admin + Editors |
| Fichas de emergência dos membros | Todos | Cada um edita a própria |
| Inventário Household (agregado) | Todos | — (calculado, não inserido) |
| Inventário pessoal compartilhado | Todos | Apenas o dono do item |
| Inventário pessoal privado | Apenas o dono | Apenas o dono |
| Checklist de preparação | Todos | Admin + Editors |
| Planos de ação / Cenários | Todos | Admin + Editors |

---

## Modelo de inventário

**Não existe "inventário household" como entidade separada.**
O Household é uma **vista calculada**: soma dos itens pessoais que cada membro
decidiu compartilhar.

```
Household = Σ (inventário pessoal de cada membro onde shared = true)
```

Cada recurso no inventário pessoal tem um toggle individual:
- `privado` → só o dono vê
- `compartilhado` → entra na soma do household

### Exemplo

```
Paulo:   água 45L [compartilhado] + kit médico [privado]
Isadora: água 30L [compartilhado] + Levotiroxina [privado]
Ana:     água 10L [privado]

Household Water: 45 + 30 = 75L  (Ana não quis compartilhar)
Household Medical: 0             (kit do Paulo é privado)
```

---

## Roles do círculo

| Role | Quem | Permissões |
|---|---|---|
| **Admin** | Líder (criador) + quem Admin nomear | Full control: criar/deletar círculo, add/remove membros, atribuir roles, editar tudo |
| **Editor** | Nomeado pelo Admin | Editar membros da família, inventário, checklist. Não pode gerenciar membros nem roles |
| **Viewer** | Default de novos membros | Somente leitura + pode adicionar comentários/notas em itens |

### Regras de role

- O criador do círculo é sempre Admin e não pode ser rebaixado
- Um Admin pode nomear outros Admins, Editors ou Viewers
- Um Editor não pode nomear roles
- Um Viewer não pode nomear roles
- Membros manuais (sem conta) não têm role — são gerenciados por quem os adicionou

---

## Membros: manuais vs. vinculados

| Tipo | Descrição | Gerenciado por |
|---|---|---|
| **Manual** | Cadastrado pelo Admin/Editor (ex: criança de 8 anos sem smartphone) | Quem adicionou, ou qualquer Admin/Editor |
| **Vinculado** | Usuário real que entrou pelo fluxo de convite | Edita seus próprios dados; Admin/Editor vê mas não edita ficha pessoal |

### Merge ao entrar no círculo

Quando um novo membro vinculado entra e já tem dados locais:

- Inventário pessoal → **mantido**, ele escolhe o que compartilha
- Membros manuais que ele já tinha → badge "possível duplicata" se existir entrada parecida no círculo
- Nenhum merge automático no MVP — usuário decide

### Isadora entra no círculo do Paulo

```
Antes: Paulo tem Isadora como membro manual
Depois: Isadora entra como membro vinculado

Resultado:
  - O card manual de Isadora recebe badge "Membro vinculado — mesma pessoa?"
  - Paulo vê opção: [Vincular] ou [Manter separado]
  - Se vincular: card manual some, dados da ficha real de Isadora passam a aparecer
  - Se manter: ambos coexistem (MVP default: manter separado com badge)
```

---

## Fluxo de convite

### Paulo convida Isadora

```
1. Paulo abre Círculos
   └── [Não tem círculo] → tela vazia com CTA "Criar meu círculo"
       └── Nomeia o círculo → criado → código gerado imediatamente

2. Paulo gera convite
   └── Código EOS-7X4K (6 chars, expira em 48h)
   └── OU QR code que embute o código

3. Paulo envia via WhatsApp / mostra o QR

4. Isadora baixa o app, faz cadastro básico
   └── "Entrar em um círculo" → digita código ou escaneia QR
   └── Pedido enviado ao Paulo com preview da ficha dela

5. Paulo aprova (notificação no app)
   └── Isadora entra → vê tudo do círculo
   └── Paulo pode atribuir role (default: Viewer)
```

### Isadora pede para entrar (sem convite prévio)

```
1. Isadora busca círculo por nome ou link direto
2. Envia pedido de adesão com mensagem opcional
3. Paulo aprova / recusa
```

### Paulo escaneia a ficha da Isadora

```
1. Paulo abre câmera no app → escaneia QR da ficha de Isadora
2. App mostra ficha dela (nome, age, condições médicas)
3. Opções:
   [Adicionar como membro manual]    → entra em Família como entrada manual
   [Convidar para o círculo]         → gera convite vinculado à ficha dela
   [Cancelar]
4. Se Paulo não tem círculo → cria círculo primeiro (never block with error)
```

---

## Pré-condições — nunca erros brutos

O app deve detectar o contexto e guiar, não bloquear:

| Ação do usuário | Se não tem círculo | Se tem círculo |
|---|---|---|
| "Convidar alguém" | Cria círculo → então convida | Gera código/QR direto |
| Escaneia ficha alheia, clica "Convidar" | Cria círculo → então convida | Gera convite direto |
| Abre "Círculos" | Tela vazia com CTA | Mostra círculo e membros |

---

## DB — tabelas necessárias

### Existentes (já têm estrutura básica)
- `circles` — id, leader_id, name, created_at
- `circle_members` — circle_id, user_id, role, joined_at

### A adicionar
- `circle_invitations` — code (6 chars), circle_id, created_by, expires_at, status (pending/accepted/expired), invitee_id?
- `resource_inventory` — adicionar `shared_fields text[] DEFAULT '{}'` (lista de campos compartilhados)
- `profiles` — adicionar campos da ficha de emergência (ver doc 09)

### Roles como enum
```sql
CREATE TYPE circle_role AS ENUM ('admin', 'editor', 'viewer');
ALTER TABLE circle_members ADD COLUMN role circle_role NOT NULL DEFAULT 'viewer';
```

---

## Incrementos de implementação

| # | Nome | Depende de | Status |
|---|---|---|---|
| 1 | Ficha Pessoal + QR público | — | NEXT UP |
| 2 | Círculo: convite + aprovação + roles | Incremento 1 | PLANNED |
| 3 | Inventário: toggle compartilhar por item | Incremento 2 | PLANNED |
| 4 | Household view no círculo | Incremento 3 | PLANNED |

---

*Atualizar este arquivo a cada decisão de design sobre círculos.*
