# SPEC AUTH-001 — Auth Flow Completo (Next.js 14 App Router + Supabase Auth)

**Status:** Ready
**Versão:** 1.1
**Data:** 2026-04-07
**Autor:** —

---

## 1. Objetivo

Implementar o sistema completo de autenticação do EOS, incluindo:
- Cadastro e login por e-mail/senha
- Logout
- Proteção de rotas autenticadas via middleware
- Callback OAuth (preparado para Google/GitHub futuros)
- **Recuperação de senha completa** (forgot → e-mail → reset)
- Criação automática de `profiles` row via trigger já existente no schema

---

## 2. Dependências de Pacotes

Antes da implementação, instalar:

```bash
npm install @supabase/ssr @supabase/supabase-js
```

Versões mínimas: `@supabase/ssr ^0.5`, `@supabase/supabase-js ^2.45`

---

## 3. Arquivos a Criar / Modificar

| Arquivo | Tipo | Observação |
|---|---|---|
| `lib/auth/utils.ts` | Novo | `getSiteUrl()` helper |
| `lib/supabase/client.ts` | Novo | Browser client |
| `lib/supabase/server.ts` | Novo | Server client com cookies |
| `middleware.ts` | Novo | Proteção de rotas + refresh de sessão |
| `app/auth/callback/route.ts` | Novo | OAuth + recovery callback |
| `lib/auth/actions.ts` | Novo | Server Actions |
| `app/auth/login/page.tsx` | Novo | Página de login |
| `app/auth/signup/page.tsx` | Novo | Página de cadastro |
| `app/auth/verify/page.tsx` | Novo | Tela "Verifique seu e-mail" pós-signup |
| `app/auth/forgot-password/page.tsx` | Novo | Solicitar reset de senha |
| `app/auth/update-password/page.tsx` | Novo | Definir nova senha (pós-link do e-mail) |

---

## 4. Comportamento

### 4.1 Fluxo de Cadastro

1. Usuário acessa `/auth/signup`
2. Preenche `name`, `email`, `password`
3. Clica em "Criar conta" → chama Server Action `signUp` via `useTransition`
4. Supabase cria `auth.users` → trigger `handle_new_user` cria row em `profiles`
5. Supabase envia e-mail de confirmação com link `type=signup`
6. **Server Action retorna `{ error: null }` → client redireciona imediatamente para `/auth/verify?email=<email>`**
7. Usuário vê a tela de verificação enquanto aguarda o e-mail
8. Usuário clica no link do e-mail → chega em `/auth/callback?code=...&type=signup`
9. Callback troca o code por sessão → redireciona para `/dashboard`

> **Rationale UX:** O usuário não fica em um limbo de "por que não consigo logar?". A tela de verificação dá instrução clara, contexto visual e ação (reenviar). Padrão adotado por Linear, Vercel e o próprio Supabase Auth UI.

**Edge case — E-mail já cadastrado:**
- Supabase retorna erro `User already registered`
- Server Action devolve `{ error: "Este e-mail já está em uso." }`
- UI exibe o erro inline, sem redirecionar

### 4.2 Fluxo de Login

1. Usuário acessa `/auth/login`
2. Preenche `email`, `password`
3. Clica em "Entrar" → chama Server Action `signIn` via `useTransition`
4. Em caso de sucesso: redireciona para `/dashboard`
5. Em caso de erro: retorna mensagem de erro (credenciais inválidas)

### 4.3 Fluxo de Logout

1. Usuário clica em "Sair" (qualquer página autenticada)
2. Chama Server Action `signOut` via `useTransition`
3. Supabase destrói a sessão + cookies são limpos
4. Redireciona para `/auth/login`

### 4.4 Fluxo de Recuperação de Senha (COMPLETO)

**Etapa 1 — Solicitar reset:**
1. Usuário acessa `/auth/forgot-password`
2. Preenche e-mail
3. Clica em "Enviar link" → chama Server Action `forgotPassword`
4. Supabase envia e-mail com link `type=recovery`
5. UI mostra mensagem de confirmação **sem revelar se o e-mail existe** (segurança)

**Etapa 2 — Callback do link:**
1. Usuário clica no link do e-mail → chega em `/auth/callback?code=...&type=recovery`
2. Callback detecta `type=recovery` → troca code por sessão
3. Redireciona para `/auth/update-password` (NÃO para `/dashboard`)

**Etapa 3 — Definir nova senha:**
1. Usuário acessa `/auth/update-password` com sessão de recovery ativa
2. Preenche `newPassword` e `confirmPassword`
3. Clica em "Salvar nova senha" → chama Server Action `updatePassword`
4. Supabase atualiza a senha via `auth.updateUser()`
5. Redireciona para `/dashboard`

**Edge case — Link expirado ou já usado:**
- Callback não consegue trocar o code → redireciona para `/auth/forgot-password?error=link_expired`
- Página exibe mensagem: "Link expirado ou inválido. Solicite um novo."

**Edge case — Acesso direto a `/auth/update-password` sem sessão de recovery:**
- Middleware detecta ausência de sessão → redireciona para `/auth/login`

### 4.5 Proteção de Rotas (Middleware)

O middleware intercepta **todas** as requisições e:

- **Rotas protegidas** (`/dashboard`, `/family`, `/inventory`, `/scenario`, `/checklist`, `/circles`):
  - Se sem sessão → redireciona para `/auth/login?redirectTo=<rota original>`
  - Se com sessão → continua normalmente + refresha o token se necessário

- **Rota `/auth/update-password`:**
  - Caso especial: permitida mesmo sem sessão estabelecida, pois o token de recovery está na URL. O middleware deve chamar `supabase.auth.getSession()` normalmente — o `@supabase/ssr` já trata o token de recovery como sessão temporária no cookie após o callback.

- **Rotas `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/callback`:**
  - Sempre públicas, sem redirecionamento

- **Função obrigatória do middleware:** Sempre chamar `supabase.auth.getUser()` para refreshar o token de acesso e reescrever os cookies de sessão na response. Sem isso, sessões expiram silenciosamente.

---

## 5. Data Contract

### 5.1 `lib/supabase/client.ts`

```typescript
// Exporta:
export function createClient(): SupabaseClient
// Usa: createBrowserClient(url, anonKey)
// Uso: componentes Client ("use client")
```

### 5.2 `lib/supabase/server.ts`

```typescript
// Exporta:
export async function createClient(): Promise<SupabaseClient>
// Usa: createServerClient(url, anonKey, { cookies })
// Uso: Server Components, Server Actions, Route Handlers
```

### 5.3 `lib/auth/actions.ts`

```typescript
// Todas as funções são "use server"

export async function signUp(formData: {
  name: string
  email: string
  password: string
}): Promise<{ error: string | null }>

export async function signIn(formData: {
  email: string
  password: string
}): Promise<{ error: string | null }>

export async function signOut(): Promise<void>
// redireciona para /auth/login via redirect()

export async function forgotPassword(formData: {
  email: string
}): Promise<{ error: string | null }>
// Chama: supabase.auth.resetPasswordForEmail(email, { redirectTo })
// redirectTo: <origin>/auth/callback?type=recovery

export async function updatePassword(formData: {
  newPassword: string
}): Promise<{ error: string | null }>
// Chama: supabase.auth.updateUser({ password: newPassword })
// Em sucesso: redireciona para /dashboard
```

### 5.4 `app/auth/callback/route.ts`

```typescript
// GET handler
// Query params relevantes:
// - code: string         → para OAuth e signup confirmation
// - type: string         → "recovery" | "signup" | undefined
// - error: string        → Supabase error code
// - error_description    → descrição legível

// Lógica de redirecionamento pós-troca de code:
// type === "recovery" → /auth/update-password
// outros             → /dashboard
// sem code ou erro   → /auth/login (ou /auth/forgot-password se type=recovery)
```

### 5.5 Variáveis de Ambiente

```
NEXT_PUBLIC_SUPABASE_URL        obrigatória
NEXT_PUBLIC_SUPABASE_ANON_KEY   obrigatória
NEXT_PUBLIC_SITE_URL            obrigatória em produção
```

`NEXT_PUBLIC_SITE_URL` é usada como base do `redirectTo` nas actions `forgotPassword` e `signUp` (confirmation link). Deve ser adicionada ao `.env.example` e ao `.env.local`.

Lógica de resolução da URL de origem (a implementar em `lib/auth/utils.ts`):
```typescript
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
```

`SUPABASE_SERVICE_ROLE_KEY` não é usada no auth flow (apenas em operações admin server-side futuras).

---

## 6. Regras de Negócio

**RN-01** — Nenhum `<form>` tag. Todos os formulários usam `<div>` ou `<section>` com `onClick` nos botões e `useTransition` para chamar as Server Actions.

**RN-02** — Mensagem de "e-mail não encontrado" não deve ser exibida no forgot-password (evitar user enumeration attack). A UI sempre exibe a mesma mensagem de sucesso independente de o e-mail existir.

**RN-03** — O middleware deve usar `supabase.auth.getUser()` (não `getSession()`) para validar a sessão no servidor, pois `getSession()` não revalida o token JWT com o servidor Supabase.

**RN-04** — O `redirectTo` passado para `resetPasswordForEmail` (e para o `emailRedirectTo` do `signUp`) deve ser construído com `getSiteUrl()` de `lib/auth/utils.ts`. Nunca hardcodar a URL. O `.env.local` deve ter `NEXT_PUBLIC_SITE_URL=http://localhost:3000` e o `.env.example` deve documenta-la. Em produção no Vercel, `VERCEL_URL` serve como fallback automático.

**RN-05** — A senha mínima aceita pelo Supabase é 6 caracteres. A validação no cliente deve refletir esse limite.

**RN-06** — `signUp` deve passar `options.data.full_name: name` para que o trigger `handle_new_user` use o nome correto ao criar o `profiles` row (via `raw_user_meta_data->>'full_name'`).

**RN-07** — O `middleware.ts` deve estar na raiz do projeto (mesmo nível de `app/`), não dentro de `app/`.

**RN-08** — O matcher do middleware deve excluir `_next/static`, `_next/image`, `favicon.ico` e arquivos de imagem para não degradar performance.

---

## 7. Critérios de Aceitação

**CA-01** — [ ] Após signup bem-sucedido, usuário é redirecionado para `/auth/verify?email=<email>` e vê a tela de verificação (não o dashboard). Após clicar no link do e-mail, é redirecionado para `/dashboard`.

**CA-01b** — [ ] Tentativa de signup com e-mail já cadastrado exibe erro inline na página de signup sem redirecionar.

**CA-02** — [ ] Usuário consegue fazer login com credenciais válidas e é redirecionado para `/dashboard`.

**CA-03** — [ ] Login com credenciais inválidas exibe mensagem de erro sem redirecionar.

**CA-04** — [ ] Usuário consegue fazer logout e é redirecionado para `/auth/login`.

**CA-05** — [ ] Acesso a `/dashboard` sem sessão redireciona para `/auth/login?redirectTo=/dashboard`.

**CA-06** — [ ] Acesso a `/family`, `/inventory`, `/scenario`, `/checklist`, `/circles` sem sessão redireciona para `/auth/login`.

**CA-07** — [ ] Usuário com sessão ativa não é redirecionado ao acessar rotas protegidas.

**CA-08** — [ ] Fluxo completo de recuperação de senha: usuário recebe e-mail, clica no link, é redirecionado para `/auth/update-password`, define nova senha, é redirecionado para `/dashboard`.

**CA-09** — [ ] Link de recovery expirado ou inválido redireciona para `/auth/forgot-password?error=link_expired` com mensagem de erro visível.

**CA-10** — [ ] Acesso direto a `/auth/update-password` sem token de recovery ativo redireciona para `/auth/login`.

**CA-11** — [ ] Formulário de forgot-password exibe mensagem de confirmação independente de o e-mail existir na base.

**CA-12** — [ ] Row em `profiles` é criada automaticamente após signUp bem-sucedido (validar via Supabase dashboard ou query).

**CA-13** — [ ] Build `next build` conclui sem erros TypeScript.

---

## 8. Especificação das Páginas de Auth

Todas as páginas de auth compartilham o mesmo layout: centralizado verticalmente e horizontalmente, max-width de `400px`, fundo da aplicação. Nenhum `<form>` — todos os campos são `<input>` dentro de `<div>`.

### 8.1 `/auth/login`

**Elementos:**
- Logo/marca do EOS (topo)
- Título: "Bem-vindo de volta"
- Input `type="email"` — label "E-mail", placeholder "seu@email.com"
- Input `type="password"` — label "Senha", placeholder "••••••••"
- Link abaixo do campo de senha: "Esqueci minha senha" → `/auth/forgot-password`
- Botão primário "Entrar"
- Link rodapé: "Não tem conta? Criar conta" → `/auth/signup`

**Estados:**
- `isPending` (useTransition): botão mostra "Entrando…" e fica desabilitado
- Erro: mensagem de erro inline acima do botão (ex: "E-mail ou senha incorretos")

### 8.2 `/auth/signup`

**Elementos:**
- Logo/marca do EOS (topo)
- Título: "Criar sua conta"
- Input `type="text"` — label "Nome", placeholder "Seu nome"
- Input `type="email"` — label "E-mail", placeholder "seu@email.com"
- Input `type="password"` — label "Senha", placeholder "Mínimo 6 caracteres", hint "mín. 6 caracteres" abaixo do campo
- Botão primário "Criar conta"
- Link rodapé: "Já tem conta? Entrar" → `/auth/login`

**Estados:**
- `isPending`: botão mostra "Criando conta…" e fica desabilitado
- Erro: mensagem de erro inline acima do botão
- Validação client-side antes de chamar a Action: nome não vazio, e-mail válido, senha ≥ 6 chars

### 8.3 `/auth/verify`

**Elementos:**
- Ícone de envelope (SVG ou lucide-react `MailOpen`)
- Título: "Verifique seu e-mail"
- Corpo: "Enviamos um link de confirmação para **{email}**. Clique no link para acessar o EOS."
- Nota secundária: "Não recebeu? Verifique a pasta de spam."
- Link: "Voltar ao login" → `/auth/login`

**Comportamento:**
- `email` exibido vem do query param `?email=<email>` (não sensível — apenas para UX)
- Página é estática — sem Server Actions, sem useTransition
- Sem botão de reenvio nesta versão (fora do escopo)

### 8.4 `/auth/forgot-password`

**Elementos:**
- Logo/marca do EOS (topo)
- Título: "Recuperar senha"
- Subtítulo: "Informe seu e-mail e enviaremos um link para criar uma nova senha."
- Input `type="email"` — label "E-mail", placeholder "seu@email.com"
- Botão primário "Enviar link"
- Link rodapé: "Lembrou a senha? Entrar" → `/auth/login`
- **Estado de sucesso** (após Action retornar sem erro): substitui o formulário por uma mensagem — "Se este e-mail estiver cadastrado, você receberá o link em instantes. Verifique também o spam." + link "Voltar ao login"

**Estados:**
- `isPending`: botão mostra "Enviando…" e fica desabilitado
- `error=link_expired` no query param: exibe alerta "Link expirado ou inválido. Solicite um novo." acima do formulário
- Sucesso: estado interno `sent = true` → renderiza mensagem, esconde formulário

### 8.5 `/auth/update-password`

**Elementos:**
- Logo/marca do EOS (topo)
- Título: "Criar nova senha"
- Input `type="password"` — label "Nova senha", placeholder "Mínimo 6 caracteres"
- Input `type="password"` — label "Confirmar nova senha", placeholder "Repita a senha"
- Botão primário "Salvar nova senha"

**Estados:**
- `isPending`: botão mostra "Salvando…" e fica desabilitado
- Validação client-side antes de chamar a Action: senhas coincidem + ≥ 6 chars
- Erro de validação client-side: mensagem inline abaixo do campo de confirmação
- Erro do servidor (ex: token expirou entre render e submit): mensagem inline acima do botão

---

## 9. Fora do Escopo

- Login social (OAuth com Google/GitHub) — o callback está preparado mas os providers não são configurados neste spec
- Two-factor authentication (2FA)
- Magic link (passwordless)
- Refresh manual de tokens (o middleware já cuida disso)
- Rate limiting de tentativas de login (responsabilidade do Supabase Auth, não da aplicação)
- Reenvio de e-mail de confirmação na tela `/auth/verify`
- Redirecionamento pós-login para `redirectTo` param (pode ser adicionado como spec separado)
- Estilização visual final (cores, tipografia, dark mode) — coberta no design system spec

---

## 10. Notas de Implementação

> A preencher durante implementação se algo não coberto pelo spec for descoberto (Regra 4).

---

**Fluxo SDD:** `Draft` → revisão → `Ready` → implementação → teste contra CA → `Done`
