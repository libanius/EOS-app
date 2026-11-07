#!/usr/bin/env bash
# INVENTORY-001 / INV-T01 — testa a migração do estoque contra um Postgres descartável.
# Uso: PGURL="postgresql://postgres@localhost:5432/invtest" bash scripts/inventory-sql-test.sh  (banco vazio)
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql ${PGURL:?defina PGURL} -v ON_ERROR_STOP=1 -qtA"
$P -c "do \$\$ begin create role anon; exception when duplicate_object then null; end \$\$; do \$\$ begin create role authenticated; exception when duplicate_object then null; end \$\$;"
$P -c "create schema if not exists auth; create or replace function auth.uid() returns uuid language sql as 'select null::uuid';"
$P -c "create table if not exists profiles(id uuid primary key); insert into profiles values ('00000000-0000-0000-0000-000000000001') on conflict do nothing;"
$P -f supabase/migrations/20260813000000_preparedness_holdings_locations.sql
$P -c "insert into locations(id,profile_id,name,is_default) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Casa',true);
insert into holdings(profile_id,location_id,resource_key,label,quantity,unit,created_at) values ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','agua','Água',40,'L','2026-08-13');"
$P -f supabase/migrations/20261108000000_inventory_stock.sql
s1=$($P -c "select md5(string_agg(h::text,'')) from holdings h")
$P -f supabase/migrations/20261108000000_inventory_stock.sql
s2=$($P -c "select md5(string_agg(h::text,'')) from holdings h")
[ "$s1" = "$s2" ] && echo "ok   idempotente (segunda execução não muda linhas)"
echo "ok   backfill: $($P -c "select provenance from holdings")"
$P -c "insert into holdings(profile_id,location_id,resource_key,label,kind,quantity,created_by) values
 ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','mochila','Mochila preta','DURABLE',1,'00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','mochila','Mochila vermelha','DURABLE',1,'00000000-0000-0000-0000-000000000001')" && echo "ok   E22 duas mochilas no mesmo lugar"
echo "ok   item novo é MANUAL: $($P -c "select string_agg(distinct provenance,',') from holdings where resource_key='mochila'")"
$P -c "insert into locations(profile_id,parent_id,name,kind,holding_id) select profile_id,location_id,label,'CUSTOM',id from holdings where label='Mochila vermelha'" && echo "ok   mochila vira lugar"
$P -c "insert into locations(profile_id,name,kind,holding_id) select profile_id,'dup','CUSTOM',id from holdings where label='Mochila vermelha'" 2>/dev/null && echo "FAIL dois lugares para a mesma mochila" || echo "ok   um lugar por mochila"
$P -c "update holdings set meals_override=-1 where resource_key='agua'" 2>/dev/null && echo FAIL || echo "ok   meals_override negativo recusado"
$P -c "update holdings set food_type='pizza' where resource_key='agua'" 2>/dev/null && echo FAIL || echo "ok   food_type fora da lista recusado"
$P -c "update holdings set provenance='X'" 2>/dev/null && echo FAIL || echo "ok   origem fora do enum recusada"

# INV-T02 — trava de escrita e um informado por recurso (20261108010000)
$P -c "do \$\$ begin create role service_role; exception when duplicate_object then null; end \$\$;"
$P -f supabase/migrations/20261108010000_inventory_stock_lock.sql
$P -f supabase/migrations/20261108010000_inventory_stock_lock.sql
echo "ok   trava: migração idempotente"
U=00000000-0000-0000-0000-000000000001
[ "$($P -c "select acquire_stock_lock(array['$U'::uuid], 'aaaaaaaa-0000-0000-0000-000000000001')")" = "t" ] && echo "ok   trava: primeira requisição pega"
[ "$($P -c "select acquire_stock_lock(array['$U'::uuid], 'bbbbbbbb-0000-0000-0000-000000000001')")" = "f" ] && echo "ok   trava: segunda requisição espera"
$P -c "select release_stock_lock('aaaaaaaa-0000-0000-0000-000000000001')"
[ "$($P -c "select acquire_stock_lock(array['$U'::uuid], 'bbbbbbbb-0000-0000-0000-000000000001')")" = "t" ] && echo "ok   trava: solta, a segunda pega"
$P -c "update stock_locks set locked_until = now() - interval '1 second'"
[ "$($P -c "select acquire_stock_lock(array['$U'::uuid], 'cccccccc-0000-0000-0000-000000000001')")" = "t" ] && echo "ok   trava vencida não segura ninguém"
$P -c "insert into holdings(profile_id,location_id,resource_key,label,quantity,unit,provenance) values ('$U','10000000-0000-0000-0000-000000000001','agua','Água 2',1,'L','BACKFILL')" 2>/dev/null && echo "FAIL dois informados" || echo "ok   um informado por recurso"
$P -c "insert into holdings(profile_id,location_id,resource_key,label,quantity,unit) values ('$U','10000000-0000-0000-0000-000000000001','agua','Galão',5,'gal')" && echo "ok   item detalhado da mesma chave continua aceito"
[ "$($P -c "select has_function_privilege('authenticated','acquire_stock_lock(uuid[],uuid,integer)','execute')")" = "f" ] && echo "ok   authenticated não executa a trava"
