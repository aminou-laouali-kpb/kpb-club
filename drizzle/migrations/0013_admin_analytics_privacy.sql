-- Phase 7 : admin complet, analytics, suppression de compte, consentement, audit

-- Analytics produit (miroir léger de PostHog)
CREATE TABLE public.events (
  id         BIGSERIAL PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  props      JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_name_time ON public.events (name, created_at);
CREATE INDEX idx_events_profile_time ON public.events (profile_id, created_at);
GRANT ALL ON public.events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.events_id_seq TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Bourses : vérification KPB, publication, filtres du catalogue
ALTER TABLE public.bourses
  ADD COLUMN IF NOT EXISTS verified_by_kpb BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS level           TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS funding         TEXT;
DROP POLICY IF EXISTS "bourses readable" ON public.bourses;
CREATE POLICY "bourses readable" ON public.bourses FOR SELECT TO anon, authenticated
  USING (published OR public.has_role(auth.uid(), 'admin'));

-- Notes des agents sur la fiche membre
CREATE TABLE public.admin_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author     UUID NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_notes_profile ON public.admin_notes (profile_id, created_at);
GRANT ALL ON public.admin_notes TO service_role;
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

-- Diffusions à un segment
CREATE TABLE public.broadcasts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment          JSONB NOT NULL DEFAULT '{}',
  channels         TEXT[] NOT NULL,
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  link             TEXT,
  recipients_count INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent')),
  created_by       UUID NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS broadcast_id UUID REFERENCES public.broadcasts(id) ON DELETE SET NULL;

-- « Revu par KPB » sur un élément de candidature
ALTER TABLE public.application_items
  ADD COLUMN IF NOT EXISTS reviewed_by_kpb_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by        UUID;

-- Consentement et suppression de compte
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS consent_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_version       TEXT,
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

-- Comptabilité et coût IA conservés sous forme anonyme après suppression d'un compte
ALTER TABLE public.payments ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_profile_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.engagements ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE public.engagements DROP CONSTRAINT IF EXISTS engagements_profile_id_fkey;
ALTER TABLE public.engagements ADD CONSTRAINT engagements_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.ai_usage ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE public.ai_usage DROP CONSTRAINT IF EXISTS ai_usage_profile_id_fkey;
ALTER TABLE public.ai_usage ADD CONSTRAINT ai_usage_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Audit : la base de connaissances contient le guide payant, elle n'est lue que par le serveur
DROP POLICY IF EXISTS "knowledge readable" ON public.knowledge_chunks;
REVOKE SELECT ON public.knowledge_chunks FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.search_knowledge(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

-- Inscription : l'événement « signup » est enregistré avec la création du profil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _profile_id UUID;
BEGIN
  INSERT INTO public.profiles (auth_user_id, email, full_name, referral_code)
  VALUES (
    NEW.id,
    CASE WHEN NEW.email LIKE '%@phone.kpb.invalid' THEN NULL ELSE NEW.email END,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    public.generate_referral_code()
  )
  ON CONFLICT (auth_user_id) DO NOTHING
  RETURNING id INTO _profile_id;
  IF _profile_id IS NOT NULL THEN
    INSERT INTO public.events (profile_id, name, props)
    VALUES (_profile_id, 'signup', jsonb_build_object(
      'method', CASE WHEN NEW.email LIKE '%@phone.kpb.invalid' THEN 'whatsapp' ELSE 'email' END
    ));
  END IF;
  RETURN NEW;
END; $$;

-- Agrégats du tableau de bord admin (appelés par le serveur uniquement)
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(_since TIMESTAMPTZ)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'alerts_sent', (SELECT count(*) FROM public.notifications
                    WHERE kind LIKE 'bourse_alert%' AND status = 'sent' AND created_at >= _since),
    'ai_calls',    (SELECT count(*) FROM public.ai_usage WHERE created_at >= _since),
    'ai_cost_usd', (SELECT coalesce(sum(cost_usd), 0) FROM public.ai_usage WHERE created_at >= _since),
    'chapters_read', (SELECT count(*) FROM public.events WHERE name = 'chapter_read' AND created_at >= _since),
    'signups',     (SELECT count(*) FROM public.profiles WHERE created_at >= _since),
    'avg_readiness', (SELECT coalesce(round(avg(readiness)), 0) FROM public.applications
                      WHERE status IN ('targeting', 'preparing', 'ready')),
    'ai_by_feature', (SELECT coalesce(jsonb_object_agg(feature, jsonb_build_object('calls', calls, 'cost', cost)), '{}'::jsonb)
                      FROM (SELECT feature::text, count(*) AS calls, coalesce(sum(cost_usd), 0) AS cost
                            FROM public.ai_usage WHERE created_at >= _since GROUP BY feature) f)
  );
$$;

-- Mois d'activité par membre (rétention par cohorte)
CREATE OR REPLACE FUNCTION public.admin_activity_months(_since TIMESTAMPTZ)
RETURNS TABLE (profile_id UUID, month TEXT) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT DISTINCT e.profile_id, to_char(date_trunc('month', e.created_at), 'YYYY-MM')
  FROM public.events e
  WHERE e.profile_id IS NOT NULL AND e.name <> 'signup' AND e.created_at >= _since;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_dashboard_stats(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_activity_months(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_activity_months(TIMESTAMPTZ) TO service_role;
