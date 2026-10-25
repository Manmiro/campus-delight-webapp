DROP POLICY IF EXISTS "read avatars publicly" ON storage.objects;
CREATE POLICY "owners read own avatars" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);