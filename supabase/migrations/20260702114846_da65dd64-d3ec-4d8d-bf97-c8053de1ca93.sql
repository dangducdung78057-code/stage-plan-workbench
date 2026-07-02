ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS webhook_secret text;