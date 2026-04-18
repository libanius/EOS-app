-- ============================================================
-- EOS — match_documents
-- Semantic similarity search via pgvector cosine distance (<=>)
-- Apply this in Supabase SQL Editor or via `supabase db push`
-- ============================================================

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding    vector(1536),
  match_threshold    float   DEFAULT 0.7,
  match_count        int     DEFAULT 5,
  filter_scenario_type text  DEFAULT NULL
)
RETURNS TABLE(
  content    text,
  source     text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as owner, bypasses RLS for the read
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.content,
    COALESCE(kb.source, 'Knowledge Base') AS source,
    -- cosine similarity = 1 - cosine distance
    (1 - (kb.embedding <=> query_embedding))::float AS similarity
  FROM knowledge_base kb
  WHERE
    -- only rows that actually have an embedding
    kb.embedding IS NOT NULL
    -- cosine similarity must meet the threshold
    AND (1 - (kb.embedding <=> query_embedding)) >= match_threshold
    -- optional scenario filter — accept NULL to return all types
    AND (
      filter_scenario_type IS NULL
      OR kb.scenario_type IS NULL
      OR kb.scenario_type::text = UPPER(filter_scenario_type)
    )
  ORDER BY
    -- ascending distance = descending similarity
    kb.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- Grant execute to authenticated users (reads via service role from the app)
GRANT EXECUTE ON FUNCTION match_documents(
  vector(1536), float, int, text
) TO authenticated, service_role;
