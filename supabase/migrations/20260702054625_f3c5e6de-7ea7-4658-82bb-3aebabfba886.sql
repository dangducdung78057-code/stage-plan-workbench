
CREATE POLICY "stageos_exports_select_own" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'stageos-exports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "stageos_exports_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'stageos-exports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "stageos_exports_update_own" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'stageos-exports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "stageos_exports_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'stageos-exports' AND auth.uid()::text = (storage.foldername(name))[1]);
