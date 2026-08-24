-- PILOT-T04 — o que medir do Pilot, e o que nunca guardar (D-132)
--
-- Este é o último portão de lançamento que o dono definiu. A spec (docs/15,
-- §19) pede cinco famílias de métrica: descoberta, confiança, retenção,
-- personalização e segurança.
--
-- A LINHA DE PRIVACIDADE ESTÁ NO ESQUEMA, não só no código que escreve.
-- Não existe coluna de texto livre nesta tabela. A pergunta que a pessoa fez,
-- a resposta do Pilot, a coordenada dela e qualquer dado de saúde NÃO CABEM
-- aqui — não por disciplina do cliente, mas porque não há onde pôr.
--
-- O mesmo raciocínio do `error_log`: uma tabela de telemetria é a que mais
-- cresce e a que menos gente audita. Se ela aceitar texto, um dia alguém
-- registra a conversa inteira "só para depurar", e aí é tarde.

create table if not exists public.pilot_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- O que aconteceu. O CHECK é a segunda porta: mesmo que um cliente adulterado
  -- invente um nome de evento, o banco recusa. A lista viva está em
  -- `lib/pilot-metrics.ts` e um teste exige que as duas batam.
  event text not null check (event in (
    'opened',          -- abriu o Pilot                     (descoberta)
    'intent',          -- usou uma das cinco intenções      (descoberta)
    'asked',           -- mandou uma pergunta livre         (descoberta)
    'answered',        -- recebeu resposta                  (confiança)
    'verdict',         -- viu uma etiqueta determinística   (segurança)
    'handle',          -- seguiu a alça do veredito         (confiança)
    'task_added',      -- virou tarefa no checklist         (confiança)
    'memory_saved',    -- corrigiu/confirmou preferência    (personalização)
    'offline',         -- perguntou sem rede                (honestidade)
    'closed'           -- fechou o Pilot                    (retenção)
  )),

  -- O veredito determinístico que estava na tela. É enum, não texto.
  verdict text check (verdict is null or verdict in ('ready', 'watch', 'hold', 'act')),

  -- Qual das cinco intenções, ou 'free' para pergunta livre. Os nomes são os
  -- do motor (`components/world-v2/pilot-engine.ts`); um vocabulário paralelo
  -- de métrica é como um painel passa a contar uma coisa e o produto a fazer
  -- outra.
  intent text check (intent is null or intent in (
    'now', 'stay_or_go', 'endurance', 'gaps', 'outside', 'free'
  )),

  -- De onde partiu: o orbe do mapa, a barra de busca, o dock, um chip.
  surface text check (surface is null or surface in ('orb', 'bar', 'dock', 'chip')),

  -- Milissegundos. Para 'opened' é o tempo até o primeiro toque na sessão;
  -- para 'answered' é quanto a pessoa esperou. Um número, nunca um texto.
  ms integer check (ms is null or (ms >= 0 and ms < 3600000)),

  created_at timestamptz not null default now()
);

-- As duas leituras que os agregados fazem: por pessoa (retenção) e por evento
-- no tempo (descoberta, funil).
create index if not exists pilot_events_user_idx on public.pilot_events (user_id, created_at desc);
create index if not exists pilot_events_event_idx on public.pilot_events (event, created_at desc);

alter table public.pilot_events enable row level security;

-- Cada pessoa só escreve o próprio rastro. Ninguém lê pelo PostgREST: os
-- agregados saem pela service role, numa rota que checa dono.
-- Sem uma policy de SELECT, o RLS nega leitura por construção.
drop policy if exists "pilot_events_insert_own" on public.pilot_events;
create policy "pilot_events_insert_own" on public.pilot_events
  for insert to authenticated
  with check (auth.uid() = user_id);

comment on table public.pilot_events is
  'PILOT-T04: telemetria do Pilot. NUNCA texto livre — sem pergunta, sem resposta, sem coordenada, sem dado de saúde. Só enums e contadores.';
