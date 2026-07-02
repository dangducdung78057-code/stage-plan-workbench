
-- 1) Add user_id to all project-scoped tables
ALTER TABLE public.projects              ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.stage_inputs          ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.plan_snapshots        ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.confirmation_records  ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.export_records        ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE INDEX IF NOT EXISTS idx_projects_user             ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_stage_inputs_user         ON public.stage_inputs(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_snapshots_user       ON public.plan_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_confirmation_records_user ON public.confirmation_records(user_id);
CREATE INDEX IF NOT EXISTS idx_export_records_user       ON public.export_records(user_id);

-- 2) Drop old permissive policies
DROP POLICY IF EXISTS "public all projects"              ON public.projects;
DROP POLICY IF EXISTS "public all stage_inputs"          ON public.stage_inputs;
DROP POLICY IF EXISTS "public all plan_snapshots"        ON public.plan_snapshots;
DROP POLICY IF EXISTS "public all confirmation_records"  ON public.confirmation_records;
DROP POLICY IF EXISTS "public all export_records"        ON public.export_records;
DROP POLICY IF EXISTS "public all settings"              ON public.settings;

-- 3) Grants (authenticated only; drop anon)
REVOKE ALL ON public.projects, public.stage_inputs, public.plan_snapshots,
             public.confirmation_records, public.export_records, public.settings
       FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_inputs         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_snapshots       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.confirmation_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.export_records       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings             TO authenticated;
GRANT ALL ON public.projects, public.stage_inputs, public.plan_snapshots,
            public.confirmation_records, public.export_records, public.settings
      TO service_role;

-- 4) Per-user RLS on projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_projects_select" ON public.projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_projects_insert" ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_projects_update" ON public.projects FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_projects_delete" ON public.projects FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 5) Helper to check project ownership without recursion issues
CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = auth.uid())
$$;

-- 6) stage_inputs
ALTER TABLE public.stage_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_stage_inputs_all" ON public.stage_inputs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND public.is_project_owner(project_id));

-- 7) plan_snapshots
ALTER TABLE public.plan_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_plan_snapshots_all" ON public.plan_snapshots FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND public.is_project_owner(project_id));

-- 8) confirmation_records
ALTER TABLE public.confirmation_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_confirmations_all" ON public.confirmation_records FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND public.is_project_owner(project_id));

-- 9) export_records
ALTER TABLE public.export_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_exports_all" ON public.export_records FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND public.is_project_owner(project_id));

-- 10) settings: authenticated-only, shared global row (id='global')
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read"  ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_write" ON public.settings FOR ALL    TO authenticated USING (true) WITH CHECK (true);
