#!/usr/bin/env bash
# CONTENT-001 — testa as funções SQL do pipeline contra um Postgres descartável.
# Uso: PGURL="postgresql://postgres@localhost:54329/postgres" bash scripts/content-pipeline-sql-test.sh
# O banco precisa estar vazio. Cria stubs de `profiles`, `anon` e `authenticated`.
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql ${PGURL:?defina PGURL} -v ON_ERROR_STOP=1 -qtA"
fail=0
check() { if [[ "$2" == *"$3"* ]]; then echo "ok   $1"; else echo "FAIL $1: esperado '$3', veio '$2'"; fail=1; fi; }

$P -c "do \$\$ begin create role anon; exception when duplicate_object then null; end \$\$; do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$;"
$P -c "create table if not exists profiles(id uuid primary key); insert into profiles values ('00000000-0000-0000-0000-000000000001') on conflict do nothing;"
$P -f supabase/migrations/20260803002000_edu_content.sql
$P -f supabase/migrations/20261106000000_content_pipeline.sql
$P -f supabase/migrations/20261106000000_content_pipeline.sql 2>/dev/null
echo "ok   migração idempotente"

emit() { npx tsx scripts/content-pipeline-emit.ts "$@"; }
recv() { local j; j=$(emit "$@"); echo "select receive_content_package('fortress', ((:'j')::jsonb->'pkg'->>'version')::int, (:'j')::jsonb->'pkg'->>'status', (:'j')::jsonb->'pkg', (:'j')::jsonb->>'hash');" | $P -v j="$j"; }
pub()  { $P -c "select publish_content_package('fortress', $1, '00000000-0000-0000-0000-000000000001')"; }
snap() { $P -c "select md5(coalesce((select string_agg(s::text,'') from signals s),'')||coalesce((select string_agg(e::text,'') from edu_content e),''))"; }

check "recebe v1"                       "$(recv 1)"        '"created"'
check "E1 reenvio igual"                "$(recv 1)"        '"unchanged"'
check "E2 mesma versão, outro conteúdo" "$(recv 1 edit)"   '"conflict"'
check "receber não publica"             "$($P -c 'select count(*) from signals')" "0"
check "publica v1"                      "$(pub 1)"         '"published"'
check "Sinal curado no ar"              "$($P -c "select status||','||reviewed_by_curator from signals")" "published,true"
check "EDU aprovado e elegível"         "$($P -c "select status||','||rag_enabled||','||source_url from edu_content")" "approved,true,/sinais/fortress"
check "E6 publicar de novo"             "$(pub 1)"         '"unchanged"'
before=$(snap); recv 2 video >/dev/null
check "8b v2 em revisão não muda o ar"  "$(snap)"          "$before"
check "E10c publicar versão velha"      "$(pub 1)"         '"stale"'
check "publica v2"                      "$(pub 2)"         '"edu_version": 2'
check "vídeo por idioma no EDU"         "$($P -c "select source_type||','||(video->'pt'->>'youtubeId') from edu_content")" "youtube,dQw4w9WgXcQ"
recv 3 archive >/dev/null
check "pipeline arquiva"                "$($P -c 'select status from signals')" "archived"
check "E16 lição continua"              "$($P -c 'select status from edu_content')" "approved"
check "não publica versão de arquivo"   "$(pub 3)"         '"archived_version"'
recv 4 >/dev/null
check "E10 volta ao ar"                 "$(pub 4)"         '"published"'
check "AGIR exige alerta"               "$($P -c "insert into signals(slug,status,version,level,occurred_on,published_on,content,sources,protocol) values ('x','published',1,'AGIR','2026-01-01','2026-01-01','{}','[{}]','{}')" 2>&1 || true)" "signals_agir_needs_alert"
check "authenticated não executa"       "$($P -c "select has_function_privilege('authenticated','publish_content_package(text,integer,uuid)','execute')")" "f"

exit $fail
