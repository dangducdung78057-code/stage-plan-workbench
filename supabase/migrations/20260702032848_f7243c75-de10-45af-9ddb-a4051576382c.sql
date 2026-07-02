
DROP POLICY IF EXISTS "own_stage_inputs_all" ON public.stage_inputs;
DROP POLICY IF EXISTS "own_plan_snapshots_all" ON public.plan_snapshots;
DROP POLICY IF EXISTS "own_confirmations_all" ON public.confirmation_records;
DROP POLICY IF EXISTS "own_exports_all" ON public.export_records;

CREATE POLICY "own_stage_inputs_all" ON public.stage_inputs FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "own_plan_snapshots_all" ON public.plan_snapshots FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "own_confirmations_all" ON public.confirmation_records FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

CREATE POLICY "own_exports_all" ON public.export_records FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid()));

DROP FUNCTION IF EXISTS public.is_project_owner(uuid);
