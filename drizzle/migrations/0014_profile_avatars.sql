-- Profile pictures: nullable avatar URL on profiles + avatars bucket RLS
ALTER TABLE public.profiles ADD COLUMN avatar_url text;

-- Storage policies: each customer manages files under avatars/<their user id>/ ; everyone can view
CREATE POLICY "read avatars publicly" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "upload own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "update own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "delete own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);