-- CONTENT-001 / CONTENT-T01 — pipeline de conteúdo: uma pauta, três saídas.
-- Spec: specs/CONTENT-001-pipeline-de-conteudo.md (§4.2, §4.2b, §4.3).
-- Aditiva e idempotente. Nada é migrado: o FORTRESS entra depois, como pauta (§6).
-- Apply in Supabase Dashboard -> SQL Editor.

-- ── content_packages: toda versão válida recebida do pipeline ──────────────
CREATE TABLE IF NOT EXISTS content_packages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text        NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  version      integer     NOT NULL CHECK (version >= 1),
  status       text        NOT NULL CHECK (status IN ('draft', 'review', 'archived')),
  payload      jsonb       NOT NULL,
  hash         text        NOT NULL,
  applied_at   timestamptz,
  applied_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);

CREATE INDEX IF NOT EXISTS content_packages_slug_version_idx
  ON content_packages (slug, version DESC);

ALTER TABLE content_packages ENABLE ROW LEVEL SECURITY;

-- ── edu_content: a lição bilíngue e o vídeo por idioma (§4.2b) ─────────────
ALTER TABLE edu_content ADD COLUMN IF NOT EXISTS video        jsonb;
ALTER TABLE edu_content ADD COLUMN IF NOT EXISTS lesson       jsonb;
ALTER TABLE edu_content ADD COLUMN IF NOT EXISTS content_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS edu_content_content_slug_key
  ON edu_content (content_slug) WHERE content_slug IS NOT NULL;

-- ── signals: só o que está ou esteve no ar ─────────────────────────────────
CREATE TABLE IF NOT EXISTS signals (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status              text        NOT NULL CHECK (status IN ('published', 'archived')),
  version             integer     NOT NULL CHECK (version >= 1),
  level               text        NOT NULL CHECK (level IN ('MONITORAR', 'PREPARAR', 'AGIR', 'CONTEXTO')),
  occurred_on         date        NOT NULL,
  published_on        date        NOT NULL,
  region              jsonb       NOT NULL DEFAULT '{"scope":"national"}'::jsonb,
  official_alert      boolean     NOT NULL DEFAULT false,
  reviewed_by_curator boolean     NOT NULL DEFAULT false,
  content             jsonb       NOT NULL,
  sources             jsonb       NOT NULL CHECK (jsonb_typeof(sources) = 'array' AND jsonb_array_length(sources) >= 1),
  protocol            jsonb       NOT NULL,
  video               jsonb,
  edu_content_id      uuid        REFERENCES edu_content(id) ON DELETE SET NULL,
  approved_by         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  published_at        timestamptz,
  archived_at         timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- SIGNAL-001 §5.5: AGIR só com alerta oficial.
  CONSTRAINT signals_agir_needs_alert CHECK (level <> 'AGIR' OR official_alert)
);

CREATE INDEX IF NOT EXISTS signals_status_idx ON signals (status, level, occurred_on DESC);

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE content_packages IS 'CONTENT-001: versões válidas recebidas do pipeline. Receber não é publicar.';
COMMENT ON TABLE signals IS 'CONTENT-001 / SIGNAL-001: Sinais no ar ou arquivados. Escrita só por publish_/archive_content_package.';

-- ── Receber (§4.3): grava só a pauta, decide numa transação ────────────────
CREATE OR REPLACE FUNCTION receive_content_package(
  p_slug text, p_version integer, p_status text, p_payload jsonb, p_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest  content_packages%ROWTYPE;
  v_same    content_packages%ROWTYPE;
BEGIN
  -- Serializa envios da mesma pauta (retries simultâneos do pipeline).
  PERFORM pg_advisory_xact_lock(hashtext('content_package:' || p_slug));

  SELECT * INTO v_same FROM content_packages WHERE slug = p_slug AND version = p_version;
  IF FOUND THEN
    IF v_same.hash = p_hash THEN
      RETURN jsonb_build_object('outcome', 'unchanged', 'version', p_version);   -- E1
    END IF;
    RETURN jsonb_build_object('outcome', 'conflict', 'version', p_version);      -- E2
  END IF;

  SELECT * INTO v_latest FROM content_packages WHERE slug = p_slug ORDER BY version DESC LIMIT 1;
  IF FOUND AND v_latest.version > p_version THEN
    RETURN jsonb_build_object('outcome', 'stale', 'latest', v_latest.version);   -- §5.8
  END IF;

  INSERT INTO content_packages (slug, version, status, payload, hash)
  VALUES (p_slug, p_version, p_status, p_payload, p_hash);

  -- Arquivar é a única coisa que o pipeline muda no ar (D-P2, §3.2).
  IF p_status = 'archived' THEN
    UPDATE signals SET status = 'archived', archived_at = now(), updated_at = now()
     WHERE slug = p_slug AND status = 'published';
  END IF;

  RETURN jsonb_build_object('outcome', 'created', 'version', p_version);
END;
$$;

-- ── Publicar (§4.3): promove a versão aprovada para signals e edu_content ──
CREATE OR REPLACE FUNCTION publish_content_package(
  p_slug text, p_version integer, p_approver uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg      content_packages%ROWTYPE;
  v_latest   integer;
  v_signal   signals%ROWTYPE;
  v_sig      jsonb;
  v_les      jsonb;
  v_video    jsonb;
  v_has_vid  boolean;
  v_edu_id   uuid;
  v_edu_ver  integer;
  v_today    date := (now() AT TIME ZONE 'America/New_York')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('content_package:' || p_slug));

  SELECT max(version) INTO v_latest FROM content_packages WHERE slug = p_slug;
  IF v_latest IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF v_latest <> p_version THEN
    RETURN jsonb_build_object('outcome', 'stale', 'latest', v_latest);           -- E10c
  END IF;

  SELECT * INTO v_pkg FROM content_packages WHERE slug = p_slug AND version = p_version;
  IF v_pkg.status = 'archived' THEN
    RETURN jsonb_build_object('outcome', 'archived_version');
  END IF;

  -- Publicar de novo a mesma versão: nada muda (E6 refaz só o RAG, na rota).
  SELECT * INTO v_signal FROM signals WHERE slug = p_slug;
  IF FOUND AND v_signal.version = p_version AND v_signal.status = 'published' THEN
    SELECT version INTO v_edu_ver FROM edu_content WHERE id = v_signal.edu_content_id;
    RETURN jsonb_build_object('outcome', 'unchanged', 'signal_id', v_signal.id,
                              'edu_id', v_signal.edu_content_id, 'edu_version', v_edu_ver);
  END IF;

  v_sig     := v_pkg.payload -> 'signal';
  v_les     := v_pkg.payload -> 'lesson';
  v_video   := NULLIF(v_pkg.payload -> 'video', 'null'::jsonb);
  v_has_vid := v_video IS NOT NULL AND (v_video ? 'pt' OR v_video ? 'en');
  IF NOT v_has_vid THEN v_video := NULL; END IF;

  -- EDU: uma linha por pauta, versão sobe a cada publicação (§3.5).
  UPDATE edu_content SET
    title         = left(btrim(v_les #>> '{title,pt}'), 160),
    summary       = btrim(v_les #>> '{summary,pt}'),
    transcript    = '## Português' || E'\n\n' || btrim(v_les #>> '{body,pt}') || E'\n\n' ||
                    '## English'   || E'\n\n' || btrim(v_les #>> '{body,en}'),
    scenario_tags = ARRAY(SELECT DISTINCT lower(btrim(t)) FROM jsonb_array_elements_text(v_les -> 'scenarioTags') t WHERE btrim(t) <> ''),
    source_type   = CASE WHEN v_has_vid THEN 'youtube' ELSE 'manual' END,
    source_url    = '/sinais/' || p_slug,
    video         = v_video,
    lesson        = jsonb_build_object('title', v_les -> 'title', 'summary', v_les -> 'summary', 'body', v_les -> 'body'),
    status        = 'approved',
    rag_enabled   = true,
    rag_ingested_at = NULL,
    version       = version + 1,
    approved_at   = now(),
    updated_by    = p_approver,
    updated_at    = now()
  WHERE content_slug = p_slug
  RETURNING id, version INTO v_edu_id, v_edu_ver;

  IF v_edu_id IS NULL THEN
    INSERT INTO edu_content (
      title, summary, transcript, scenario_tags, source_type, source_url, video, lesson,
      content_slug, status, rag_enabled, version, approved_at, created_by, updated_by
    ) VALUES (
      left(btrim(v_les #>> '{title,pt}'), 160),
      btrim(v_les #>> '{summary,pt}'),
      '## Português' || E'\n\n' || btrim(v_les #>> '{body,pt}') || E'\n\n' ||
      '## English'   || E'\n\n' || btrim(v_les #>> '{body,en}'),
      ARRAY(SELECT DISTINCT lower(btrim(t)) FROM jsonb_array_elements_text(v_les -> 'scenarioTags') t WHERE btrim(t) <> ''),
      CASE WHEN v_has_vid THEN 'youtube' ELSE 'manual' END,
      '/sinais/' || p_slug,
      v_video,
      jsonb_build_object('title', v_les -> 'title', 'summary', v_les -> 'summary', 'body', v_les -> 'body'),
      p_slug, 'approved', true, 1, now(), p_approver, p_approver
    )
    RETURNING id, version INTO v_edu_id, v_edu_ver;
  END IF;

  -- Sinal: entra ou volta ao ar com a versão aprovada (E10).
  INSERT INTO signals (
    slug, status, version, level, occurred_on, published_on, region, official_alert,
    reviewed_by_curator, content, sources, protocol, video, edu_content_id,
    approved_by, published_at, archived_at, updated_at
  ) VALUES (
    p_slug, 'published', p_version, v_sig ->> 'level', (v_sig ->> 'occurredOn')::date, v_today,
    '{"scope":"national"}'::jsonb, coalesce((v_sig ->> 'officialAlert')::boolean, false),
    true,
    jsonb_build_object(
      'title', v_sig -> 'title', 'summary', v_sig -> 'summary', 'whatItIs', v_sig -> 'whatItIs',
      'whatItIsNot', v_sig -> 'whatItIsNot', 'curatorNote', v_sig -> 'curatorNote', 'sourceLine', v_sig -> 'sourceLine'
    ),
    v_sig -> 'sources', v_sig -> 'protocol', v_video, v_edu_id,
    p_approver, now(), NULL, now()
  )
  ON CONFLICT (slug) DO UPDATE SET
    status = 'published',
    version = EXCLUDED.version,
    level = EXCLUDED.level,
    occurred_on = EXCLUDED.occurred_on,
    -- Volta de arquivado ganha data nova (E10); atualização de um Sinal no ar mantém a dele.
    published_on = CASE WHEN signals.status = 'archived' THEN EXCLUDED.published_on ELSE signals.published_on END,
    official_alert = EXCLUDED.official_alert,
    reviewed_by_curator = true,
    content = EXCLUDED.content,
    sources = EXCLUDED.sources,
    protocol = EXCLUDED.protocol,
    video = EXCLUDED.video,
    edu_content_id = EXCLUDED.edu_content_id,
    approved_by = EXCLUDED.approved_by,
    published_at = now(),
    archived_at = NULL,
    updated_at = now()
  RETURNING * INTO v_signal;

  UPDATE content_packages SET applied_at = now(), applied_by = p_approver
   WHERE slug = p_slug AND version = p_version;

  RETURN jsonb_build_object('outcome', 'published', 'signal_id', v_signal.id,
                            'edu_id', v_edu_id, 'edu_version', v_edu_ver);
END;
$$;

-- ── Arquivar pelo botão (§4.3) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION archive_content_package(p_slug text) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE signals SET status = 'archived', archived_at = now(), updated_at = now()
   WHERE slug = p_slug AND status = 'published'
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('outcome', CASE WHEN EXISTS (SELECT 1 FROM signals WHERE slug = p_slug) THEN 'already_archived' ELSE 'not_found' END);
  END IF;
  RETURN jsonb_build_object('outcome', 'archived', 'signal_id', v_id);
END;
$$;

-- Só o service role chama estas funções (as rotas autorizam antes).
REVOKE ALL ON FUNCTION receive_content_package(text, integer, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION publish_content_package(text, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION archive_content_package(text) FROM PUBLIC, anon, authenticated;
