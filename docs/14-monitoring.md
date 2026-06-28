# 14 — Monitoramento em Tempo Real

> Spec do sistema de vigilância proativa de ameaças do EOS.
> Decisões: D-022, D-023, D-024, D-025
> Tarefas: P2-T08 a P2-T12

---

## Mudança de paradigma

O EOS hoje é **reativo**: o usuário descreve o que está acontecendo e recebe um plano.

Com monitoramento, o EOS vira **proativo**: o app detecta ameaças na localização do usuário antes de ele precisar descrever qualquer coisa.

```
ANTES:   Usuário → "rio transbordando aqui" → AI → plano
DEPOIS:  USGS detecta → EOS alerta → usuário toca → AI já tem o contexto → plano
```

O monitoramento não substitui o campo livre de descrição — ele o enriquece com dados reais antes mesmo de o usuário digitar.

---

## Fontes de dados

### Prioritárias (gratuitas, sem chave)

| API | Cobertura | Endpoint base | Latência |
|---|---|---|---|
| NWS/NOAA | Clima severo, alertas ativos, previsão | `api.weather.gov` | Minutos |
| USGS Earthquakes | Terremotos em tempo real, GeoJSON | `earthquake.usgs.gov/fdsnws/event/1` | Segundos |
| FEMA OpenFEMA | Declarações de desastre, abrigos ativos | `api.fema.gov/v2` | Horas |

### Prioritárias (chave gratuita)

| API | Cobertura | Endpoint base | Latência |
|---|---|---|---|
| AirNow | Índice de qualidade do ar (AQI) | `airnowapi.org/aq/observation` | Horária |
| NASA FIRMS | Incêndios detectados por satélite | `firms.modaps.eosdis.nasa.gov` | 3 horas |

### Secundárias (implementação futura)

| API | Cobertura | Endpoint base |
|---|---|---|
| CDC (Socrata) | Surtos de doenças, vigilância epidemiológica | `data.cdc.gov` |
| FDA OpenFDA | Recalls de medicamentos e alimentos | `open.fda.gov` |
| NHC | Furacões e tempestades tropicais | Feeds RSS/GIS |
| SPC | Tornados e tempestades severas | `spc.noaa.gov` |
| USGS Water | Níveis de rios, risco de enchente | `waterdata.usgs.gov` |
| USGS Volcano | Atividade vulcânica | `volcanoes.usgs.gov` |
| tsunami.gov | Alertas de tsunami | Feed NWS |

---

## Arquitetura técnica

### Princípios

1. **Server-side only** — chamadas às APIs externas feitas no servidor (`/api/monitor`), nunca no cliente. Evita CORS, protege chaves, permite cache centralizado.
2. **Cache com TTL** — respostas cacheadas por fonte: clima 5min, terremoto 1min, FEMA 30min, AirNow 60min, NASA FIRMS 3h. Redis (já configurado) é o cache preferido; fallback in-memory.
3. **Polling pelo cliente** — frontend faz polling a `/api/monitor` a cada 5 minutos enquanto o app está aberto. Sem websockets no MVP.
4. **Localização obrigatória** — todas as APIs são geo-baseadas. `profiles.location` precisa virar lat/lng (ver D-024 e P2-T08).

### Rota principal

```
GET /api/monitor?lat=-23.5&lng=-46.6&sources=weather,earthquake,fema,aqi,fire
```

Resposta normalizada:
```json
{
  "location": { "lat": -23.5, "lng": -46.6 },
  "alerts": [
    {
      "source": "nws",
      "type": "SEVERE_THUNDERSTORM",
      "severity": "HIGH",
      "headline": "Severe Thunderstorm Warning",
      "expires": "2026-06-28T22:00:00Z",
      "url": "..."
    }
  ],
  "status": {
    "weather":    "ALERT",
    "earthquake": "CLEAR",
    "fire":       "WATCH",
    "aqi":        "MODERATE",
    "disaster":   "CLEAR"
  },
  "cached_at": "2026-06-28T20:15:00Z"
}
```

### Severidade normalizada

Todas as fontes usam escalas diferentes. O EOS normaliza para:

| Nível | Cor | Significado |
|---|---|---|
| `CRITICAL` | Vermelho | Ação imediata necessária |
| `HIGH` | Laranja | Preparação urgente |
| `WATCH` | Amarelo | Monitorar de perto |
| `MODERATE` | Amarelo claro | Atenção geral |
| `CLEAR` | Verde | Sem ameaças ativas |

---

## Integração com o Decision Engine

Quando o usuário abre o Motor de Decisão (tela Cenário), os alertas ativos são automaticamente injetados no contexto da análise AI:

```
[Contexto automático injetado]
- Alerta NWS ativo: Severe Thunderstorm Warning (expira em 2h)
- USGS: sem sismos nas últimas 24h raio 200km
- AQI: 87 (Moderado) — grupos sensíveis devem limitar atividade externa

[Descrição do usuário]
"O rio perto de casa está subindo"
```

O AI recebe os dados reais integrados ao prompt, sem o usuário precisar informar.

---

## Integração com a tela de Cenário

A tela Cenário é redesenhada para mostrar o painel de ameaças ANTES do campo de descrição livre:

```
┌─────────────────────────────────┐
│ ⚡ ALERTA ATIVO — 2 fontes      │
│ Tempestade severa · 40km        │
│ [Ver detalhes]  [Criar plano →] │
├─────────────────────────────────┤
│ ●  Terremoto    CLEAR           │
│ ⚡  Clima       ALERT           │
│ 🔥  Incêndios   WATCH           │
│ 💨  Ar          MODERATE        │
│ 🏛  FEMA        CLEAR           │
└─────────────────────────────────┘
│ Ou descreva sua situação:       │
│ ┌─────────────────────────────┐ │
│ │ O que está acontecendo?     │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

Tocar em "Criar plano →" num alerta pré-preenche o campo com o contexto e dispara análise.

---

## Distribuição por tier

| Feature | Gratuito | Família | Premium |
|---|---|---|---|
| Clima + alertas severos (NWS) | ✅ | ✅ | ✅ |
| Terremotos (USGS) | ✅ | ✅ | ✅ |
| Qualidade do ar — AQI (AirNow) | — | ✅ | ✅ |
| Desastres FEMA + abrigos | — | ✅ | ✅ |
| Incêndios satélite (NASA FIRMS) | — | ✅ | ✅ |
| Vigilância CDC (surtos) | — | — | ✅ |
| Recalls FDA (medicamentos/alimentos) | — | — | ✅ |
| Monitorar localização dos membros do círculo | — | ✅ | ✅ |
| Notificações push de alerta crítico | — | — | ✅ |
| Histórico de alertas (últimos 30 dias) | — | — | ✅ |

---

## Pré-requisito crítico

**`profiles.location` precisa virar `lat` + `lng`.**

Hoje é um campo de texto livre. Nenhuma das APIs aceita texto — todas precisam de coordenadas.

Solução: adicionar `location_lat float8` e `location_lng float8` à tabela `profiles`. O campo `location` (texto) coexiste como label legível na UI.

Geocodificação: ao salvar a localização, chamar `nominatim.openstreetmap.org` (gratuito, sem chave) para converter texto → lat/lng e salvar ambos.

---

## Incrementos de implementação

| Task | Descrição | Bloqueador |
|---|---|---|
| P2-T08 | Localização: `profiles.location_lat/lng` + geocoding no onboarding | Nenhum |
| P2-T09 | `/api/monitor` — agregador server-side (NWS + USGS primeiro) | P2-T08 |
| P2-T10 | Tela Cenário redesenhada com painel de status de ameaças | P2-T09 |
| P2-T11 | Feature gates de monitoramento em `lib/feature-gates.ts` | P2-T07 |
| P2-T12 | Monitoramento multi-localização (membros do círculo, tier Família) | P2-T11 + P2-T02 |

---

*Fontes: NWS Developer API docs · USGS FDSN Webservices · FEMA OpenFEMA API · AirNow API docs · NASA FIRMS Web Services*
