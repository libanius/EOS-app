-- D-090 / EDU-T01 — approved educational content catalog.
-- Apply in Supabase Dashboard -> SQL Editor before publishing persistent EDU.

CREATE TABLE IF NOT EXISTS edu_content (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text        NOT NULL CHECK (char_length(title) > 0 AND char_length(title) <= 160),
  source_type     text        NOT NULL DEFAULT 'manual' CHECK (source_type IN ('youtube', 'manual', 'pdf', 'external')),
  source_url      text,
  scenario_tags   text[]      NOT NULL DEFAULT '{}',
  summary         text        NOT NULL DEFAULT '',
  transcript      text        NOT NULL DEFAULT '',
  status          text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  version         integer     NOT NULL DEFAULT 1,
  rag_enabled     boolean     NOT NULL DEFAULT false,
  rag_ingested_at timestamptz,
  created_by      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by      uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS edu_content_status_updated_idx
  ON edu_content (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS edu_content_tags_idx
  ON edu_content USING gin (scenario_tags);

ALTER TABLE edu_content ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE edu_content IS
  'D-090 EDU-T01: approved educational content catalog. RAG ingestion is a later explicit job.';
COMMENT ON COLUMN edu_content.rag_enabled IS
  'Eligible for future RAG ingestion; does not mean embeddings already exist.';
