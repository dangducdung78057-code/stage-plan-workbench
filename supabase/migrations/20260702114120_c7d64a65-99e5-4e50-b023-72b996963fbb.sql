
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS webhook_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS webhook_events text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  url text NOT NULL,
  status text NOT NULL,
  http_status int,
  attempt int NOT NULL DEFAULT 1,
  error text,
  project_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.webhook_delivery_logs TO authenticated;
GRANT ALL ON public.webhook_delivery_logs TO service_role;

ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own webhook logs"
  ON public.webhook_delivery_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own webhook logs"
  ON public.webhook_delivery_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
