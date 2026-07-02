ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS procurement_candidates_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS procurement_provider_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS procurement_export_attachment_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS procurement_provider TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS procurement_api_base_url TEXT;

ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_procurement_provider_check;

ALTER TABLE public.settings
  ADD CONSTRAINT settings_procurement_provider_check
  CHECK (procurement_provider IN ('local', 'http'));

UPDATE public.settings
SET procurement_provider = COALESCE(NULLIF(procurement_provider, ''), 'local')
WHERE id = 'global';