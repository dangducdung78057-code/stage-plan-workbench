CREATE TABLE IF NOT EXISTS public.system_capabilities (
  module text PRIMARY KEY,
  layer text NOT NULL CHECK (layer IN ('L0','L1','L2')),
  status text NOT NULL CHECK (status IN ('PASS','WARN','FAIL','SKIP')),
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.system_capabilities TO anon, authenticated;
GRANT ALL ON public.system_capabilities TO service_role;

ALTER TABLE public.system_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_capabilities read all"
  ON public.system_capabilities
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP TRIGGER IF EXISTS trg_system_capabilities_touch ON public.system_capabilities;
CREATE TRIGGER trg_system_capabilities_touch
  BEFORE UPDATE ON public.system_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();