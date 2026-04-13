-- ================================================================
-- match_knowledge: pgvector cosine similarity search
-- Run this in Supabase SQL Editor after creating the schema.
-- ================================================================

CREATE OR REPLACE FUNCTION match_knowledge (
  query_embedding  vector(1536),
  match_threshold  float    DEFAULT 0.65,
  match_count      int      DEFAULT 5,
  filter_scenario  text     DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  content      text,
  source       text,
  similarity   float,
  chunk_index  integer
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.content,
    kb.source,
    1 - (kb.embedding <=> query_embedding) AS similarity,
    kb.chunk_index
  FROM knowledge_base kb
  WHERE
    -- Optional scenario filter: include rows matching the scenario OR general (null)
    (filter_scenario IS NULL
      OR kb.scenario_type IS NULL
      OR kb.scenario_type = filter_scenario::scenario_type_enum)
    AND
    -- Cosine similarity threshold
    1 - (kb.embedding <=> query_embedding) >= match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
