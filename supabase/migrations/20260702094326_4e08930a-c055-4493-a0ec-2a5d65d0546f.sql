CREATE TABLE public.health_check_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  baseline TEXT NOT NULL,
  route TEXT,
  user_agent TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  pass_count INT NOT NULL DEFAULT 0,
  warn_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  skip_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.health_check_runs TO authenticated;
GRANT ALL ON public.health_check_runs TO service_role;

ALTER TABLE public.health_check_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own health check runs"
ON public.health_check_runs FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX health_check_runs_user_created_idx
ON public.health_check_runs (user_id, created_at DESC);