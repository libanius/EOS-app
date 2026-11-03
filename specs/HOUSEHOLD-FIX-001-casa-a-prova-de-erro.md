# SPEC — HOUSEHOLD-FIX-001: Casa à prova de erro (duplicatas e convites)
Version: 1.0 | Status: **Ready** (aprovado pelo dono em 2026-11-03) | Author: Paulo Neto

> Regra 1: nenhum código antes de Ready. Este spec está **Ready**.
> Regra 3: os edge cases ficam escritos aqui (§6) e não são descobertos no código.
> Regra 4: se a implementação revelar algo que este spec não cobre, **pare** e atualize o spec antes de continuar.
> Regra 5: critérios binários. Não existe "parcialmente implementado".

---

## 1. Objetivo

Garantir que ninguém consiga **criar uma pessoa duplicada sem perceber** e que
qualquer erro de cadastro possa ser **desfeito na própria tela onde aparece**.
O convite de quem tem celular precisa ter um caminho único e óbvio até o link
chegar no WhatsApp.

Frase-guia:

> **Errar tem que ser difícil. Desfazer tem que ser fácil.**

---

## 2. Contexto: o incidente de 2026-11-03

Uma usuária nova (conta criada às 12:12) cadastrou duas pessoas da casa, Alexia e
Grazi. Em 16 minutos, o banco tinha **4 convites pendentes**:

| Convite | Hora | O que aconteceu |
|---|---|---|
| Graziela | 12:16 | primeira tentativa |
| Graziela Letteriello | 12:18 | redigitou com sobrenome |
| Alexia Letteriello | 12:18 | — |
| Alexa Letteriello | 12:28 | redigitou com erro de digitação |

Depois ela relatou dois problemas: "não acho onde apagar" e "pergunta se elas têm
telefone, mas onde eu cadastro o telefone?". A limpeza foi feita à mão no banco.

Causas encontradas no código:

| # | Causa | Onde |
|---|---|---|
| C1 | Depois de salvar, o formulário **esvazia a lista** (`setMoradores([])`) e não mostra quem já mora na casa. A pessoa acha que não salvou e digita de novo. | `components/HomeAddress.tsx` |
| C2 | A trava de duplicata só barra nomes **idênticos** (`lower(trim(name))`). "Graziela" e "Graziela Letteriello" passam, assim como "Alexa" e "Alexia". | índice `household_invites_owner_name_idx` |
| C3 | A lista "Convidadas, ainda não entraram" **não tem nenhum botão**: não envia, não corrige e não remove. O servidor já sabe descartar (`PATCH status: dismissed`), mas nenhuma tela chama isso. | `RosterPage.tsx` |
| C4 | Excluir um dependente só é possível no **fim da folha de edição**, depois de todos os campos. | `RosterPage.tsx` |
| C5 | A pergunta "Tem celular / Não tem" faz a pessoa esperar um campo de número, que não existe (de propósito: o convite é um link). | `HomeAddress.tsx` |
| C6 | O detector de duplicatas (D-135) compara dependente com conta, mas **não compara convite com dependente nem convite com convite**. | `/api/household` |
| C7 | O `GET /api/household/address` devolve só os convites `pending`. Um convite marcado como `sent` **some da tela** antes de a pessoa entrar. | rota de endereço |

---

## 3. Comportamento esperado

### 3.1 O formulário mostra quem já mora aqui (corrige C1)

Na seção "Mais alguém mora neste endereço?", **acima do campo de nome**, aparece a
lista atual da casa, lida de `/api/household` e `/api/household/address`:

- contas que confirmaram morar ali;
- dependentes;
- convidados (pendentes e enviados).

Cada pessoa aparece com o seu estado ("tem conta", "sob seus cuidados",
"convite não enviado", "convite enviado"). Depois de salvar, quem foi incluído
**passa para essa lista**, em vez de sumir.

### 3.2 Aviso de nome parecido antes de incluir (corrige C2 e C6)

Ao tocar em "Incluir", o nome é comparado com **todo mundo da casa** (contas,
dependentes, convites pendentes e enviados) e com a lista ainda não salva. Se
houver um nome parecido (regra 5), o nome **não entra direto**. Aparece:

> **Já existe "Graziela Letteriello" na casa. É a mesma pessoa?**
> [ É a mesma, não incluir ] [ É outra pessoa, incluir ]

- "É a mesma" descarta o que foi digitado e destaca a pessoa existente na lista.
- "É outra pessoa" inclui normalmente.
- O aviso **nunca bloqueia**: mãe e filha podem ter o mesmo nome.

### 3.3 Pergunta do celular sem ambiguidade (corrige C5)

| Antes | Depois |
|---|---|
| Tem celular / Não tem | **Vai usar o EOS no celular dela** / **Fica sob meus cuidados** |
| "Recebe um convite para entrar com a conta dela." | "Você manda um link pelo WhatsApp. **Não precisamos do número dela.**" |

O mesmo texto vale em EN. Nenhuma tela do fluxo pede ou menciona número de telefone.

### 3.4 Cada convidado tem as suas ações na própria linha (corrige C3)

Na tela Cadastro, cada convidado mostra três ações:

| Ação | O que faz |
|---|---|
| **Enviar convite** | Abre o compartilhamento nativo com o link do círculo (o mesmo de `InviteShare`). Se o compartilhamento for concluído, o convite passa a `sent`. No fallback da área de transferência, aparece o botão "Já enviei", que marca como `sent`. |
| **Corrigir nome** | Edita o nome ali mesmo, com o mesmo aviso de nome parecido (§3.2). |
| **Remover** | Marca como `dismissed` e mostra a barra "Removida · **Desfazer**" por 8 s. |

Um convite enviado continua visível como "Convite enviado em dd/mm", com as
ações "Reenviar" e "Remover", até a pessoa entrar.

### 3.5 Excluir dependente direto do cartão, com desfazer (corrige C4)

- O cartão de cada dependente ganha **"Remover"** ao lado de "Editar".
- Remover tira a pessoa da lista na hora e mostra a barra "Removida · **Desfazer**" por 8 s.
- O `DELETE` no servidor só é enviado **quando os 8 s terminam**. Se o app fechar
  antes disso, a pessoa continua cadastrada. Na dúvida, o sistema nunca apaga.
- A confirmação em duas etapas no fim da folha de edição continua existindo.

### 3.6 O alerta de duplicata cobre os três tipos (corrige C6)

O aviso "Esta pessoa aparece duas vezes", que já existe na tela Família, passa a
comparar convite com convite, convite com dependente e dependente com conta,
usando a mesma regra de semelhança (regra 5). As ações do aviso:

- **"É a mesma pessoa"**: mantém o registro mais completo, seguindo a ordem
  conta > dependente > convite enviado > convite pendente; no empate, fica o nome
  mais longo. O outro registro é removido, com barra de desfazer.
- **"São duas pessoas"**: o aviso não aparece de novo para esse par (§4.3).

---

## 4. Data Contract

### 4.1 `POST /api/household/address`

```ts
// request
{
  address: Address,
  residents: Array<{
    name: string,
    usesApp: boolean,            // renomeia hasPhone. O servidor aceita os dois nomes durante a transição
    confirmDistinct?: boolean    // true = o usuário respondeu "É outra pessoa"
  }>
}

// response (aditivo)
{
  ok: true,
  formatted: string,
  located: boolean,
  dependents: number,
  pendingInvites: number,
  skipped: Array<{                // NOVO: nomes parecidos enviados sem confirmDistinct
    name: string,
    matches: Array<{ kind: 'account' | 'dependent' | 'invite', id: string, name: string }>
  }>
}
```

O endereço **sempre** é salvo. Só o morador parecido fica de fora e volta em
`skipped`, para que a tela faça a pergunta de §3.2. O servidor aplica a mesma
regra do cliente, como defesa para clientes antigos.

### 4.2 `GET` e `PATCH /api/household/address`

```ts
// GET: passa a devolver pendentes E enviados
{ invites: Array<{ id: string, name: string, status: 'pending' | 'sent', sent_at: string | null }>,
  pending: [...] }   // mantido por compatibilidade = só os pending

// PATCH
{ id: string,
  status?: 'pending' | 'sent' | 'dismissed',   // 'pending' NOVO, usado pelo Desfazer
  name?: string }                              // NOVO, usado por Corrigir nome
// 409 { error: 'name_taken' } quando o nome restaurado ou corrigido colide com o índice único
```

### 4.3 Pares marcados como "duas pessoas"

```sql
create table public.household_distinct_pairs (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  a_key      text not null,   -- 'invite:<uuid>' | 'dependent:<uuid>' | 'account:<uuid>'
  b_key      text not null,   -- sempre ordenado: a_key < b_key
  created_at timestamptz not null default now(),
  primary key (owner_id, a_key, b_key)
);
-- RLS: deny-all; acesso só pelas rotas (mesmo padrão de household_invites)
```

Nenhuma outra alteração de schema. Dependentes **não** ganham soft delete: o
desfazer é feito pelo atraso do `DELETE` (§3.5).

### 4.4 `lib/household-names.ts` (novo, compartilhado entre cliente e servidor)

```ts
normalizeName(s: string): string
similarNames(a: string, b: string): boolean
findSimilar(name: string, people: Array<{ kind, id, name }>): Array<{ kind, id, name }>
```

---

## 5. Regras de Negócio

1. **Nunca juntar sozinho.** Semelhança gera pergunta, nunca união nem exclusão automática.
2. **Nunca bloquear.** "É outra pessoa" sempre permite incluir.
3. **Na dúvida, não apagar.** Exclusão interrompida (app fechado, rede caiu) deixa o registro de pé.
4. **Desfazer em 8 s** para toda remoção feita fora da folha de edição.
5. **Regra de semelhança** (determinística, sem IA). Depois de `normalizeName` (minúsculas, sem acento, espaços colapsados), dois nomes são parecidos se valer **qualquer uma** destas condições:
   - a. são iguais;
   - b. todas as palavras do nome mais curto aparecem no mais longo, com a primeira palavra igual ("Graziela" ~ "Graziela Letteriello");
   - c. a primeira palavra de um é prefixo, com **≥ 4 letras**, da primeira palavra do outro, e os sobrenomes não se contradizem ("Grazi" ~ "Graziela");
   - d. a distância de edição entre os nomes completos é **≤ 2**, quando ambos têm ≥ 5 letras ("Alexa Letteriello" ~ "Alexia Letteriello").
6. Nenhuma tela pede ou guarda número de telefone de terceiros.
7. `sent` só é marcado por ato do usuário: compartilhamento concluído ou toque em "Já enviei". O app nunca afirma que alguém foi convidado sem esse ato (mantém D-130).
8. Os nomes de terceiros continuam deny-all, visíveis só pelas rotas do dono (mantém a política de `household_invites`).

---

## 6. Edge cases

| # | Situação | Comportamento |
|---|---|---|
| E1 | O caso do incidente: "Graziela" salvo e depois "Graziela Letteriello" digitado | Aviso de §3.2 apontando "Graziela". "É a mesma" não inclui. |
| E2 | "Alexa Letteriello" com "Alexia Letteriello" já na casa | Aviso (regra 5d). |
| E3 | Mãe e filha com o mesmo nome | Aviso. "É outra pessoa" inclui as duas, e o par vai para `household_distinct_pairs`. |
| E4 | "Ana" e "Anabela" | **Não** avisa: o prefixo tem menos de 4 letras (5c). |
| E5 | "Maria Silva" e "Maria Souza" | **Não** avisa: os sobrenomes se contradizem e a distância de edição é > 2. |
| E6 | Desfazer a remoção de um convite cujo nome já foi recriado como pendente | O `PATCH` devolve 409 `name_taken`. A barra mostra "Já existe um convite com esse nome" e não duplica. |
| E7 | Remover um dependente e fechar o app antes de 8 s | O `DELETE` não sai, e a pessoa continua no cadastro (regra 3). |
| E8 | Remover um dependente que está vinculado a uma conta (`linked_user_id`) | Remove só o registro de dependente. A conta da pessoa continua no círculo. O texto da barra diz isso. |
| E9 | "Enviar convite" sem círculo criado | Decisão D1 (a). Com plano Família, o toque cria o círculo ("Casa de <primeiro nome>") e abre o compartilhamento na sequência. O convite fica ligado ao círculo (`circle_id`). Sem plano Família, aparece a oferta do plano. Se a pessoa disser "agora não", o convite continua `pending` e nada se perde. |
| E17 | A criação do círculo falha (rede ou erro do servidor) | Mostra "Não consegui criar o círculo. Tente de novo". O convite continua `pending`, e nenhum círculo fica criado pela metade. |
| E18 | Dois toques rápidos em "Enviar convite" sem círculo | Cria **um** círculo só. O botão fica desativado enquanto a criação está em andamento. |
| E10 | O usuário cancela o menu de compartilhamento | Nada muda, e o convite continua `pending`. |
| E11 | Desktop sem `navigator.share` | Copia o link, mostra "Convite copiado" e o botão "Já enviei". |
| E12 | A pessoa convidada entra no círculo | O convite sai de "Convidadas" quando a união acontece. A sugestão automática "É a Alexia?" fica fora deste spec (§8). |
| E13 | Duas abas abertas removendo a mesma pessoa | O segundo `DELETE` ou `PATCH` devolve 404, e a tela recarrega a lista sem mostrar erro assustador. |
| E14 | Cliente antigo envia `hasPhone` sem `confirmDistinct` com nome parecido | O servidor salva o endereço e devolve o morador em `skipped`. O cliente antigo ignora isso, e nenhuma duplicata é criada. |
| E15 | Nome com acento e sem acento ("Grazielá" e "Graziela") | É tratado como igual (normalização). |
| E16 | Lista da casa não carrega no formulário (rede) | O formulário funciona, mostra "Não consegui ver quem já mora aqui" e o servidor aplica a regra 5 mesmo assim. |
| E19 | "É outra pessoa" com grafia **idêntica** a um convite pendente (ex.: mãe e filha "Maria Lima", as duas com celular) | O índice único do banco não aceita dois convites pendentes com o mesmo nome, e é ele que impede o "Desfazer" de duplicar (E6). A tela pede um detalhe que diferencie ("Maria (mãe)"). Para dependentes não há essa trava: entram os dois. |

---

## 7. Critérios de Aceitação

**HFIX-T01: regra de semelhança**
- [ ] `lib/household-names.ts` existe e é usado pelo cliente e pelo servidor.
- [ ] Os testes unitários cobrem E1, E2, E3, E4, E5 e E15 e todos passam.

**HFIX-T02: formulário de endereço**
- [ ] Antes do campo de nome, o formulário lista quem já mora na casa, com o estado de cada pessoa.
- [ ] Depois de salvar, os nomes incluídos aparecem nessa lista.
- [ ] Ao digitar um nome parecido com alguém da casa, aparece o aviso de §3.2 antes de incluir.
- [ ] Nenhum texto do fluxo contém "Tem celular", "telefone" ou um campo de número.
- [ ] Os textos novos existem em PT e EN.

**HFIX-T03: tela Cadastro**
- [ ] Cada convite pendente mostra "Enviar convite", "Corrigir nome" e "Remover".
- [ ] Remover um convite leva **no máximo 1 toque** e mostra "Desfazer" por 8 s.
- [ ] Desfazer devolve o convite para `pending`.
- [ ] Um convite `sent` continua visível com a data de envio.
- [ ] Com plano Família e sem círculo, "Enviar convite" cria um único círculo e abre o compartilhamento (E9, E18).
- [ ] Sem plano Família, "Enviar convite" mostra a oferta do plano, e o convite continua `pending`.
- [ ] Se a criação do círculo falhar, nenhum círculo fica criado e o convite continua `pending` (E17).
- [ ] O cartão de cada dependente tem "Remover", e o `DELETE` só sai depois de 8 s sem desfazer.
- [ ] Fechar o app dentro dos 8 s não apaga o dependente (E7).

**HFIX-T04: servidor**
- [ ] `POST /api/household/address` com um nome parecido e sem `confirmDistinct` não cria registro e devolve o nome em `skipped`.
- [ ] O `PATCH` aceita `status: 'pending'` e `name`, e devolve 409 em colisão.
- [ ] O `GET` devolve convites `pending` e `sent`.
- [ ] A tabela `household_distinct_pairs` existe com RLS deny-all.

**HFIX-T05: alerta de duplicata na Família**
- [ ] O alerta aparece para convite com convite, convite com dependente e dependente com conta.
- [ ] "É a mesma pessoa" mantém o registro mais completo (§3.6) e oferece desfazer.
- [ ] "São duas pessoas" não volta a perguntar sobre o mesmo par em outra sessão.

**Teste de regressão do incidente**
- [ ] Repetir a sequência de §2 (Graziela → Graziela Letteriello → Alexia Letteriello → Alexa Letteriello) termina com **2** convites, e não 4, quando o usuário responde "É a mesma" nos avisos.

---

## 8. Fora do Escopo

- Convite por SMS (Twilio) e campo de telefone de terceiros.
- Sugestão automática "É a Alexia?" quando alguém entra no círculo (fase 2, reaproveita `findSimilar`).
- Soft delete de dependentes com lixeira permanente.
- Semelhança por IA ou por apelidos que não sejam prefixo ("Zezinho" e "José").
- Mudanças no fluxo de vínculo de conta (`/link`).

---

## 9. Decisões (resolvidas em 2026-11-03)

- **D1 = (a).** "Enviar convite" sem círculo **cria o círculo na hora** quando há plano Família. Sem o plano, mostra a oferta do plano (E9, E17, E18).
- **D2 = 8 s.** É o tempo do desfazer para toda remoção feita fora da folha de edição.
- **D3. Sim.** A usuária é beta tester e entra como caso real de validação. A conta `7fd0a3a4…` já foi limpa à mão; os convites duplicados estão `dismissed`, não apagados.

---

## 10. Achados da implementação (Regra 4, 2026-11-03)

- **A1. Já existia uma regra de nomes** (`lib/same-person.ts`, D-135), mais larga: primeiro nome igual bastava para perguntar ("Maria Silva" ~ "Maria Souza"). O spec pede o contrário (E5). `lib/household-names.ts` reaproveita a normalização de lá (sem acento, sem "da/de/do") e implementa a regra 5; o alerta de duplicata passou a usar a regra 5. O fechamento automático de convite de quem já entrou (`podeFecharConvite`, nível `forte`) continua como estava.
- **A2. Grafia idêntica com "É outra pessoa"** esbarra no índice único de convites pendentes. Virou o edge case E19.
- **A3. "É a mesma pessoa" entre dependente e conta** não apaga o dependente: **vincula** à conta (rota `/link`, que já existia). O efeito na casa é o mesmo (uma pessoa só) e a ficha do dependente não se perde; "Desfazer" desvincula.
- **A4. Sair da tela Cadastro pelo próprio app** não é fechar o app: os DELETEs que estavam esperando os 8 s saem na hora, para a pessoa não reaparecer na tela Família. Fechar o app de verdade continua não apagando (E7).
- **A5. Criar o círculo e abrir o WhatsApp no mesmo toque** pode ser recusado pelo navegador (o iOS exige um toque recente, e criar o círculo leva uma ida à rede). Nesse caso a tela diz "Círculo criado. Toque em Enviar convite de novo".
- **A6. E17 no servidor:** `POST /api/circles` agora desfaz o círculo se não conseguir colocar o criador dentro.
