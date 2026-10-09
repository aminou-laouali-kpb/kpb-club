-- Coffre-fort documents et recommandateurs

CREATE TYPE public.document_type AS ENUM (
  'passport', 'id_card', 'birth_certificate', 'photo_id',
  'diploma_bac', 'diploma_licence', 'diploma_master', 'transcript',
  'cv', 'motivation_letter', 'recommendation_letter',
  'english_test', 'proof_of_income', 'proof_of_residence', 'other'
);

CREATE TABLE public.documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type         public.document_type NOT NULL,
  label        TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER,
  pages        INTEGER,
  source       TEXT CHECK (source IN ('upload', 'camera', 'whatsapp')),
  processed    BOOLEAN NOT NULL DEFAULT false,
  expires_at   DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_profile_type ON public.documents (profile_id, type);
GRANT SELECT ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own documents select" ON public.documents
  FOR SELECT TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Liaison des items de checklist aux documents
ALTER TABLE public.application_items
  ADD COLUMN IF NOT EXISTS document_type      TEXT,
  ADD COLUMN IF NOT EXISTS document_id        UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recommenders_count INTEGER;

UPDATE public.application_items i
SET document_type = r.document_type,
    recommenders_count = r.recommenders_count
FROM public.bourse_requirements r
WHERE i.requirement_id = r.id;

-- Bucket privé : envois par URL signée d'upload, lectures par URL signée (10 min)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Recommandateurs
CREATE TYPE public.recommender_status AS ENUM ('to_contact', 'requested', 'reminded', 'received', 'declined');

CREATE TABLE public.recommenders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  full_name      TEXT NOT NULL,
  title          TEXT,
  institution    TEXT,
  email          TEXT,
  phone          TEXT,
  relation       TEXT,
  strengths      TEXT,
  status         public.recommender_status NOT NULL DEFAULT 'to_contact',
  auto_remind    BOOLEAN NOT NULL DEFAULT false,
  requested_at   TIMESTAMPTZ,
  reminded_at    TIMESTAMPTZ,
  received_at    TIMESTAMPTZ,
  document_id    UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_recommenders_profile ON public.recommenders (profile_id);
CREATE INDEX idx_recommenders_status ON public.recommenders (status, requested_at);
GRANT SELECT ON public.recommenders TO authenticated;
GRANT ALL ON public.recommenders TO service_role;
ALTER TABLE public.recommenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recommenders select" ON public.recommenders
  FOR SELECT TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
