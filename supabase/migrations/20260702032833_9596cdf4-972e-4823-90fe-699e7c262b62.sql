
DROP POLICY IF EXISTS "settings_write" ON public.settings;
CREATE POLICY "settings_insert" ON public.settings FOR INSERT TO authenticated WITH CHECK (id = 'global');
CREATE POLICY "settings_update" ON public.settings FOR UPDATE TO authenticated USING (id = 'global') WITH CHECK (id = 'global');

REVOKE EXECUTE ON FUNCTION public.is_project_owner(uuid) FROM PUBLIC, anon, authenticated;
