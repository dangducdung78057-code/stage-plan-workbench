
-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  performance_date DATE,
  performer_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO anon, authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);

-- Stage inputs (1:1)
CREATE TABLE public.stage_inputs (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_inputs TO anon, authenticated;
GRANT ALL ON public.stage_inputs TO service_role;
ALTER TABLE public.stage_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all stage_inputs" ON public.stage_inputs FOR ALL USING (true) WITH CHECK (true);

-- Plan snapshots
CREATE TABLE public.plan_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'mock',
  costume_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  reverse_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  platform_search JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_snapshots TO anon, authenticated;
GRANT ALL ON public.plan_snapshots TO service_role;
ALTER TABLE public.plan_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all plan_snapshots" ON public.plan_snapshots FOR ALL USING (true) WITH CHECK (true);

-- Confirmation records
CREATE TABLE public.confirmation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES public.plan_snapshots(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.confirmation_records TO anon, authenticated;
GRANT ALL ON public.confirmation_records TO service_role;
ALTER TABLE public.confirmation_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all confirmation_records" ON public.confirmation_records FOR ALL USING (true) WITH CHECK (true);

-- Export records
CREATE TABLE public.export_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES public.plan_snapshots(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  format TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_records TO anon, authenticated;
GRANT ALL ON public.export_records TO service_role;
ALTER TABLE public.export_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all export_records" ON public.export_records FOR ALL USING (true) WITH CHECK (true);

-- Settings (single row keyed by id='global')
CREATE TABLE public.settings (
  id TEXT PRIMARY KEY,
  api_mode TEXT NOT NULL DEFAULT 'mock',
  api_base_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO anon, authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);
INSERT INTO public.settings (id, api_mode) VALUES ('global', 'mock');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER stage_inputs_touch BEFORE UPDATE ON public.stage_inputs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER settings_touch BEFORE UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
