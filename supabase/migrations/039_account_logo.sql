ALTER TABLE wacrm.accounts ADD COLUMN IF NOT EXISTS logo_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  TRUE,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies for logos
DROP POLICY IF EXISTS "Logos are publicly readable" ON storage.objects;
CREATE POLICY "Logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

DROP POLICY IF EXISTS "Admins can upload logos" ON storage.objects;
CREATE POLICY "Admins can upload logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND EXISTS (
      SELECT 1 FROM wacrm.profiles
      WHERE user_id = auth.uid()
        AND account_id = (storage.foldername(name))[1]::uuid
        AND account_role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can update logos" ON storage.objects;
CREATE POLICY "Admins can update logos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'logos'
    AND EXISTS (
      SELECT 1 FROM wacrm.profiles
      WHERE user_id = auth.uid()
        AND account_id = (storage.foldername(name))[1]::uuid
        AND account_role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins can delete logos" ON storage.objects;
CREATE POLICY "Admins can delete logos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'logos'
    AND EXISTS (
      SELECT 1 FROM wacrm.profiles
      WHERE user_id = auth.uid()
        AND account_id = (storage.foldername(name))[1]::uuid
        AND account_role IN ('owner', 'admin')
    )
  );
