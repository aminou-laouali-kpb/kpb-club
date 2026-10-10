-- Coach IA : consommation, conversations, critères d'évaluation, base de connaissances

CREATE TYPE public.ai_feature AS ENUM ('essay_review', 'cv_review', 'interview_sim', 'coach_chat', 'doc_classify');

-- Une ligne par appel réussi : sert aux quotas, au suivi des coûts et à l'historique.
-- `result` garde les scores et critères, jamais le texte de l'étudiant.
CREATE TABLE public.ai_usage (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature        public.ai_feature NOT NULL,
  model          TEXT NOT NULL,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  cached_tokens  INTEGER,
  cost_usd       NUMERIC(8,5),
  application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  item_id        UUID REFERENCES public.application_items(id) ON DELETE SET NULL,
  thread_id      UUID,
  result         JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_usage_month ON public.ai_usage (profile_id, feature, created_at);
GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai usage select" ON public.ai_usage
  FOR SELECT TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TABLE public.ai_threads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature        public.ai_feature NOT NULL,
  application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  title          TEXT,
  state          JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_threads_profile ON public.ai_threads (profile_id, created_at DESC);
GRANT SELECT ON public.ai_threads TO authenticated;
GRANT ALL ON public.ai_threads TO service_role;
ALTER TABLE public.ai_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai threads select" ON public.ai_threads
  FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

CREATE TABLE public.ai_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES public.ai_threads(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_messages_thread ON public.ai_messages (thread_id, created_at);
GRANT SELECT ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai messages select" ON public.ai_messages
  FOR SELECT TO authenticated
  USING (
    thread_id IN (
      SELECT t.id FROM public.ai_threads t
      JOIN public.profiles p ON p.id = t.profile_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

ALTER TABLE public.application_items
  ADD COLUMN IF NOT EXISTS last_ai_review_id UUID REFERENCES public.ai_usage(id) ON DELETE SET NULL;

-- Critères d'évaluation des essais et format d'entretien, par bourse
ALTER TABLE public.bourses
  ADD COLUMN IF NOT EXISTS essay_criteria   JSONB,
  ADD COLUMN IF NOT EXISTS interview_format TEXT CHECK (interview_format IN ('none', 'video', 'panel', 'written'));

UPDATE public.bourses SET
  essay_criteria = '[
    {"name": "Clarté du projet", "description": "Le projet d''études est précis : programme visé, objectifs, débouchés.", "weight": 25},
    {"name": "Adéquation au programme", "description": "Le candidat montre pourquoi ce programme et cette université, avec des éléments concrets.", "weight": 20},
    {"name": "Impact communautaire", "description": "Le retour attendu pour la communauté ou le pays d''origine est démontré par des actions passées et un plan réaliste.", "weight": 25},
    {"name": "Preuves et exemples", "description": "Les affirmations sont appuyées par des faits, des chiffres, des réalisations vérifiables.", "weight": 20},
    {"name": "Qualité de l''écriture", "description": "Structure, fluidité, correction de la langue, voix personnelle.", "weight": 10}
  ]'::jsonb,
  interview_format = CASE WHEN english_required THEN 'video' ELSE 'panel' END
WHERE id LIKE 'exemple-%' AND essay_criteria IS NULL;

-- Base de connaissances pour les questions-réponses (recherche plein texte en français)
CREATE TABLE public.knowledge_chunks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source     TEXT NOT NULL,          -- 'guide' | 'bourse'
  ref        TEXT NOT NULL,          -- slug du chapitre ou id de bourse
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  tsv        tsvector GENERATED ALWAYS AS (
               setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
               setweight(to_tsvector('french', coalesce(content, '')), 'B')
             ) STORED,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, ref, title)
);
CREATE INDEX idx_knowledge_tsv ON public.knowledge_chunks USING GIN (tsv);
GRANT SELECT ON public.knowledge_chunks TO anon, authenticated;
GRANT ALL ON public.knowledge_chunks TO service_role;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "knowledge readable" ON public.knowledge_chunks FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.search_knowledge(_query TEXT, _limit INTEGER DEFAULT 5)
RETURNS TABLE (source TEXT, ref TEXT, title TEXT, content TEXT, rank REAL)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT k.source, k.ref, k.title, k.content, ts_rank(k.tsv, q) AS rank
  FROM public.knowledge_chunks k, websearch_to_tsquery('french', _query) q
  WHERE k.tsv @@ q
  ORDER BY rank DESC
  LIMIT LEAST(GREATEST(_limit, 1), 10);
$$;
GRANT EXECUTE ON FUNCTION public.search_knowledge(TEXT, INTEGER) TO authenticated, service_role;
