DROP POLICY IF EXISTS "dashboard users remove their staged attachments" ON storage.objects;
CREATE POLICY "dashboard users remove their staged attachments" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'dashboard-attachments'
  AND owner_id = (select auth.uid()::text)
  AND (storage.foldername(name))[1] = (select auth.uid()::text)
);