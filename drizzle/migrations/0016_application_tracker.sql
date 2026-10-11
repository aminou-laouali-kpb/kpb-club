-- Tracker de candidature : exigences par bourse, candidatures, checklist

ALTER TABLE public.bourses
  ADD COLUMN IF NOT EXISTS operations_order   JSONB,
  ADD COLUMN IF NOT EXISTS whatsapp_group_url TEXT,
  ADD COLUMN IF NOT EXISTS video_url          TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE public.requirement_kind AS ENUM ('document', 'essay', 'recommendation', 'form', 'test', 'other');
CREATE TYPE public.application_status AS ENUM (
  'targeting', 'preparing', 'ready', 'submitted', 'interview', 'accepted', 'rejected', 'abandoned'
);
CREATE TYPE public.item_status AS ENUM ('todo', 'in_progress', 'done', 'na');

-- Ce qu'exige chaque bourse
CREATE TABLE public.bourse_requirements (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bourse_id            TEXT NOT NULL REFERENCES public.bourses(id) ON DELETE CASCADE,
  kind                 public.requirement_kind NOT NULL,
  label                TEXT NOT NULL,
  description          TEXT,
  document_type        TEXT,
  essay_prompt         TEXT,
  essay_max_words      INTEGER,
  essay_language       TEXT DEFAULT 'fr',
  recommenders_count   INTEGER,
  sort_order           INTEGER NOT NULL,
  days_before_deadline INTEGER
);
CREATE INDEX idx_bourse_requirements_bourse ON public.bourse_requirements (bourse_id, sort_order);
GRANT SELECT ON public.bourse_requirements TO anon, authenticated;
GRANT ALL ON public.bourse_requirements TO service_role;
ALTER TABLE public.bourse_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bourse requirements readable" ON public.bourse_requirements
  FOR SELECT TO anon, authenticated USING (true);

-- Une candidature ciblée
CREATE TABLE public.applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bourse_id        TEXT NOT NULL REFERENCES public.bourses(id) ON DELETE CASCADE,
  status           public.application_status NOT NULL DEFAULT 'targeting',
  deadline         DATE,
  readiness        INTEGER NOT NULL DEFAULT 0,
  next_action      TEXT,
  next_item_id     UUID,
  submitted_at     TIMESTAMPTZ,
  outcome_note     TEXT,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, bourse_id)
);
CREATE INDEX idx_applications_profile ON public.applications (profile_id, deadline);
CREATE TRIGGER applications_touch BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
GRANT SELECT ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own applications select" ON public.applications
  FOR SELECT TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- La checklist d'une candidature
CREATE TABLE public.application_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id       UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  requirement_id       UUID REFERENCES public.bourse_requirements(id) ON DELETE SET NULL,
  kind                 public.requirement_kind NOT NULL,
  label                TEXT NOT NULL,
  description          TEXT,
  essay_prompt         TEXT,
  essay_max_words      INTEGER,
  status               public.item_status NOT NULL DEFAULT 'todo',
  due_date             DATE,
  essay_draft          TEXT,
  essay_draft_saved_at TIMESTAMPTZ,
  sort_order           INTEGER,
  completed_at         TIMESTAMPTZ
);
CREATE INDEX idx_application_items_app ON public.application_items (application_id, sort_order);
GRANT SELECT ON public.application_items TO authenticated;
GRANT ALL ON public.application_items TO service_role;
ALTER TABLE public.application_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own application items select" ON public.application_items
  FOR SELECT TO authenticated
  USING (
    application_id IN (
      SELECT a.id FROM public.applications a
      JOIN public.profiles p ON p.id = a.profile_id
      WHERE p.auth_user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- Exigences de démonstration pour les bourses d'exemple
INSERT INTO public.bourse_requirements
  (bourse_id, kind, label, description, document_type, essay_prompt, essay_max_words, essay_language, recommenders_count, sort_order, days_before_deadline)
SELECT b.id, r.kind::public.requirement_kind, r.label, r.description, r.document_type,
       CASE WHEN r.kind = 'essay' THEN
         CASE WHEN b.english_required
           THEN 'Describe a challenge you faced in your community and how your studies will help you address it.'
           ELSE 'Présentez votre projet d''études et son impact attendu sur votre communauté.' END
       END,
       CASE WHEN r.kind = 'essay' THEN 600 END,
       CASE WHEN r.kind = 'essay' AND b.english_required THEN 'en' WHEN r.kind = 'essay' THEN 'fr' END,
       r.recommenders_count, r.sort_order, r.days_before
FROM public.bourses b
CROSS JOIN (VALUES
  ('document', 'Passeport valide', 'Valable au moins 6 mois après la date de départ prévue.', 'passport', NULL::int, 1, 45),
  ('document', 'Relevés de notes', 'Toutes les années du dernier cycle, traduits si nécessaire.', 'transcript', NULL, 2, 30),
  ('document', 'Dernier diplôme obtenu', 'Copie certifiée conforme.', 'diploma_licence', NULL, 3, 30),
  ('document', 'CV académique', 'Deux pages maximum, format académique.', 'cv', NULL, 4, 21),
  ('essay', 'Essai de motivation', NULL, NULL, NULL, 5, 14),
  ('recommendation', 'Lettres de recommandation', 'Deux enseignants ou encadrants qui vous connaissent bien.', NULL, 2, 6, 10),
  ('form', 'Formulaire de candidature en ligne', 'À remplir sur le site officiel de la bourse.', NULL, NULL, 7, 3)
) AS r(kind, label, description, document_type, recommenders_count, sort_order, days_before)
WHERE b.id LIKE 'exemple-%';

INSERT INTO public.bourse_requirements (bourse_id, kind, label, description, sort_order, days_before_deadline)
SELECT id, 'test', 'Test d''anglais (IELTS, TOEFL ou Duolingo)', 'Inscrivez-vous tôt : les résultats prennent 1 à 3 semaines.', 8, 30
FROM public.bourses WHERE id LIKE 'exemple-%' AND english_required;