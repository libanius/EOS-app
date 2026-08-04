-- D-112 / COMMS-T07 — lightweight EDU click count for featured video.

ALTER TABLE public.edu_content
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0 CHECK (view_count >= 0);

CREATE INDEX IF NOT EXISTS edu_content_view_count_idx
  ON public.edu_content (view_count DESC, updated_at DESC)
  WHERE status = 'approved';

COMMENT ON COLUMN public.edu_content.view_count IS
  'D-112 COMMS-T07: lightweight platform click/view count used to feature the most clicked EDU video.';
