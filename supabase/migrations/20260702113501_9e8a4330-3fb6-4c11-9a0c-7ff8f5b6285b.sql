ALTER TABLE public.health_check_runs
  ADD COLUMN IF NOT EXISTS is_release boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS release_note text,
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE INDEX IF NOT EXISTS health_check_runs_release_idx
  ON public.health_check_runs (user_id, is_release, created_at DESC);