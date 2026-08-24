# Alertas automáticos — ativação (D-074)

> Como ligar a varredura agendada que faz o EOS avisar **com o app fechado**.
> Companion: `hazard-data-integrations-audit.md` (o que cada fonte entrega),
> `hazard-provider-setup.md` (credenciais dos providers).

---

## O que isso resolve

Até aqui o EOS **recebia** os dados certos e não **entregava** nada: toda rota era
on-demand, então o dado só era buscado quando alguém abria a tela. O único push
existente era o broadcast manual de um Admin de círculo.

Além disso, faltava a memória. Um alerta útil fala de **mudança** ("foi elevado
a Tempestade Tropical"), não de estado ("existe uma Tempestade Tropical"). Sem
guardar o estado anterior, é impossível dizer a primeira frase.

---

## Passo 1 — Aplicar a migration

No **SQL Editor do Supabase**, cole e execute:

```
supabase/migrations/20260824000000_hazard_alerting.sql
```

É idempotente e autossuficiente: pode rodar quantas vezes precisar, e funciona
tanto se a migration antiga (`20260710010000_hazard_tables.sql`) já foi aplicada
quanto se nunca foi. Ela cria/completa 6 tabelas:

| Tabela | Para quê |
|---|---|
| `hazard_events` | O estado atual de cada evento — **a memória** que a comparação usa |
| `hazard_transitions` | O que mudou, e quando. Auditoria e histórico |
| `notification_delivery_log` | O que foi entregue, e o **motivo** de cada supressão |
| `user_hazard_preferences` | Tipos ligados, quiet hours, cooldown |
| `hazard_subscriptions` | Lugares vigiados além da localização atual |
| `provider_health` | Última medição por provider |

Conferir depois de aplicar:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('hazard_events','hazard_transitions','notification_delivery_log',
                     'user_hazard_preferences','hazard_subscriptions','provider_health');
-- devem voltar 6 linhas
```

---

## Passo 2 — Variáveis de ambiente

| Variável | Já existe? | Para quê |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ em uso | Ler perfis e gravar eventos ignorando RLS |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✅ em uso | Push |
| `VAPID_PRIVATE_KEY` | ✅ em uso | Push |
| `CRON_SECRET` | ⚠️ **novo** | Autenticar a varredura |

Gerar o `CRON_SECRET`:

```bash
openssl rand -hex 32
```

Adicione em **Vercel → Settings → Environment Variables** (Production). Sem ele
a rota responde `503` e **não roda** — um endpoint aberto que martela os feeds e
notifica todo mundo não é coisa que se deixa exposta.

Sem as chaves VAPID a varredura ainda roda: as transições são detectadas e
gravadas, e cada tentativa entra no log como `failed / VAPID keys missing`. O
silêncio nunca é confundido com "nenhum perigo hoje".

---

## Passo 3 — Agendar

### Opção A — pg_cron no Supabase (recomendada, custo zero)

O plano Hobby da Vercel só permite **1 cron por dia**, o que é inútil para
alertas. O `pg_cron` roda dentro do próprio Supabase, a cada 10 minutos, sem
custo adicional. O bloco pronto está comentado no final da migration — troque
`<SEU-DOMINIO>` e `<CRON_SECRET>` e execute **depois** do deploy:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'eos-hazard-scan',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<SEU-DOMINIO>/api/cron/hazard-scan',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <CRON_SECRET>"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

Conferir: `SELECT * FROM cron.job;` · Desagendar: `SELECT cron.unschedule('eos-hazard-scan');`

### Opção B — Vercel Cron

`vercel.json` já traz a entrada `*/10 * * * *`. Ela só vale de fato no plano
**Pro**; no Hobby a Vercel reduz para 1x/dia silenciosamente. A Vercel envia o
`Authorization: Bearer $CRON_SECRET` automaticamente quando a env existe.

### Custo real de uma varredura

O gargalo não é dinheiro, é chamada externa. Uma passada faz ~6 requisições por
**localização distinta arredondada a 2 casas (~1,1 km)** — famílias vizinhas
compartilham a mesma busca. Todos os feeds usados (NWS, USGS, NHC, Open-Meteo)
são gratuitos e sem chave. Os limites ficam em `HAZARD_CONFIG.alerting`:
`maxLocationsPerRun: 60`, `scanConcurrency: 4`.

---

## Passo 4 — Testar

```bash
curl -X POST https://<SEU-DOMINIO>/api/cron/hazard-scan \
  -H "Authorization: Bearer $CRON_SECRET"
```

Resposta:

```json
{
  "locations": 3,
  "usersConsidered": 5,
  "transitions": 2,
  "pushed": 1,
  "suppressed": { "deduped": 4, "not_relevant": 1 },
  "errors": [],
  "durationMs": 4210
}
```

**A primeira execução quase sempre gera muitas transições e poucos pushes.** É o
esperado: sem memória anterior, todo evento ativo é "novo". O `dedupKey` impede
que a segunda passada repita qualquer um deles.

Para inspecionar o que foi decidido e por quê:

```sql
SELECT kind, title, from_state, to_state, detected_at
FROM hazard_transitions ORDER BY detected_at DESC LIMIT 20;

SELECT status, count(*) FROM notification_delivery_log
WHERE sent_at > now() - interval '1 day' GROUP BY status;
```

---

## O que ganha um push

| Tipo | Dispara quando | Padrão |
|---|---|---|
| `tropical_cyclone` | Se formou, foi elevado ou rebaixado | **≤ 750 mi** de você |
| `severe_weather` | Alerta oficial NWS entra em vigor / muda de nível | Sempre (é para o seu ponto) |
| `earthquake` | Sismo relevante detectado (regras em `lib/hazards/earthquake.ts`) | Sempre |
| `air_quality` | AQI cruza para ≥ 101 (insalubre p/ grupos sensíveis) | Sempre |
| `precipitation` | Chuva ≥ moderada começando em ≤ 30 min | Sempre |

### Por que 750 milhas

O concorrente envia *"Tropical Storm Iselle has formed in the E. Pacific"* para
um telefone na Flórida. Isso é escolha de ser **interessante**, não de ser
**útil**. O padrão do EOS é o contrário: só avisa sobre o que pode te alcançar.
Quem quiser o comportamento do concorrente liga `basin_wide_tropical` em
`user_hazard_preferences` — a opção existe, mas é escolha explícita.

### Supressões

Toda decisão de **não** notificar vira uma linha no log com o motivo:
`deduped`, `not_relevant`, `suppressed_quiet_hours`, `suppressed_cooldown`,
`plan_gated`, `no_subscription`, `failed`. Quando alguém perguntar "por que eu
não fui avisado do furacão?", existe resposta.

**Quiet hours** usam o fuso aproximado pela longitude (15°/hora), porque o
perfil não guarda timezone. É preciso ao redor de uma hora — suficiente para
não acordar ninguém às 3h, insuficiente para prometer "exatamente 22:00".
Alertas críticos furam a janela quando `allow_critical_override` está ligado
(padrão).

---

## Limitações conhecidas

1. **Idioma**: o push sai em português para todos. A escolha de idioma vive no
   `localStorage` do aparelho (`lib/i18n.tsx`) e o servidor não a enxerga.
   Corrigir = persistir a preferência em `profiles`.
2. **Gate de plano**: `monitoring_push` é `premium` (`lib/feature-gates.ts`).
   Alertas **críticos** furam o gate; o resto não. Se a decisão for que todo
   alerta de segurança é gratuito, muda uma linha — mas é decisão de produto.
3. **Cobertura**: NWS é só EUA. Fora dos EUA restam NHC, USGS, AQI e nowcast.
4. **Sem UI de preferências**: a API `/api/hazards/preferences` existe (GET/PUT);
   a tela ainda não.
