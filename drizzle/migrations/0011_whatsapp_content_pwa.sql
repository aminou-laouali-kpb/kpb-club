-- WhatsApp (connexion par code, bot, notifications), contenus en base, lauréats, parcours anglais

-- Profils : téléphone vérifié, préférences de notification, anglais
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_e164               TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS phone_verified_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notif_whatsapp_alerts    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_whatsapp_reminders BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_whatsapp_content   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_email              BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS english_test             TEXT CHECK (english_test IN ('ielts', 'toefl', 'duolingo', 'none')),
  ADD COLUMN IF NOT EXISTS english_test_score       TEXT,
  ADD COLUMN IF NOT EXISTS english_test_date        DATE,
  ADD COLUMN IF NOT EXISTS english_self_level       TEXT;

GRANT UPDATE (
  notif_whatsapp_alerts, notif_whatsapp_reminders, notif_whatsapp_content, notif_email,
  english_test, english_test_score, english_test_date, english_self_level
) ON public.profiles TO authenticated;

-- Les comptes créés par code WhatsApp ont une adresse technique, jamais recopiée dans le profil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, email, full_name, referral_code)
  VALUES (
    NEW.id,
    CASE WHEN NEW.email LIKE '%@phone.kpb.invalid' THEN NULL ELSE NEW.email END,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    public.generate_referral_code()
  )
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- Codes de connexion (hachés), envoyés par WhatsApp ou SMS
CREATE TABLE public.otp_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164      TEXT NOT NULL,
  code_hash       TEXT NOT NULL,
  purpose         TEXT NOT NULL DEFAULT 'login' CHECK (purpose IN ('login', 'link')),
  profile_id      UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
  wa_message_id   TEXT,
  delivery_status TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  ip              TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_codes_phone ON public.otp_codes (phone_e164, created_at DESC);
CREATE INDEX idx_otp_codes_wa_message ON public.otp_codes (wa_message_id);
GRANT ALL ON public.otp_codes TO service_role;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Bot WhatsApp : état de conversation et messages reçus
CREATE TABLE public.whatsapp_sessions (
  phone_e164      TEXT PRIMARY KEY,
  profile_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  pending         JSONB,
  last_inbound_at TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_sessions TO service_role;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.whatsapp_inbound (
  wa_message_id TEXT PRIMARY KEY,
  phone_e164    TEXT NOT NULL,
  kind          TEXT NOT NULL,
  body          TEXT,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_inbound TO service_role;
ALTER TABLE public.whatsapp_inbound ENABLE ROW LEVEL SECURITY;

-- Notifications : modèle WhatsApp et identifiant du message envoyé
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS template        TEXT,
  ADD COLUMN IF NOT EXISTS template_params JSONB,
  ADD COLUMN IF NOT EXISTS wa_message_id   TEXT;

-- Contenus
CREATE TABLE public.content_chapters (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,
  title      TEXT NOT NULL,
  summary    TEXT,
  body_md    TEXT NOT NULL,
  sort_order INTEGER,
  published  BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.content_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,
  title      TEXT NOT NULL,
  summary    TEXT,
  category   TEXT CHECK (category IN ('cv', 'motivation', 'essay', 'recommendation', 'email')),
  body_md    TEXT NOT NULL,
  prefill    BOOLEAN NOT NULL DEFAULT false,
  published  BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.content_posts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL CHECK (kind IN ('bourse', 'video', 'method', 'news')),
  title        TEXT NOT NULL,
  body_md      TEXT,
  url          TEXT,
  bourse_id    TEXT REFERENCES public.bourses(id) ON DELETE SET NULL,
  notify       BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ
);
CREATE TABLE public.content_post_reads (
  post_id    UUID NOT NULL REFERENCES public.content_posts(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, profile_id)
);
-- Le contenu payant est servi par le serveur (filigrane) : pas de lecture directe des membres
GRANT ALL ON public.content_chapters, public.content_templates, public.content_posts, public.content_post_reads TO service_role;
ALTER TABLE public.content_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_post_reads ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER content_chapters_touch BEFORE UPDATE ON public.content_chapters FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER content_templates_touch BEFORE UPDATE ON public.content_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Lauréats (affichés seulement s'ils sont vérifiés et ont donné leur accord écrit)
CREATE TABLE public.laureates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  country    TEXT,
  bourse_id  TEXT REFERENCES public.bourses(id) ON DELETE SET NULL,
  bourse_name TEXT,
  year       INTEGER,
  quote      TEXT,
  video_url  TEXT,
  verified   BOOLEAN NOT NULL DEFAULT false,
  consent_at TIMESTAMPTZ,
  is_demo    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.laureates TO anon, authenticated;
GRANT ALL ON public.laureates TO service_role;
ALTER TABLE public.laureates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "published laureates" ON public.laureates
  FOR SELECT TO anon, authenticated USING (verified AND consent_at IS NOT NULL);

INSERT INTO public.laureates (first_name, country, bourse_name, year, quote, verified, consent_at, is_demo) VALUES
('Aïcha', 'NE', 'Bourse Femmes Leaders Afrique', 2026, 'Témoignage de démonstration : la checklist m''a évité d''oublier ma lettre de recommandation la veille de la date limite.', true, now(), true),
('Ibrahim', 'ML', 'Erasmus Mundus', 2026, 'Témoignage de démonstration : l''analyse de mon essai m''a montré que je ne parlais jamais de mon impact concret.', true, now(), true),
('Fatou', 'SN', 'Sciences Po Paris', 2025, 'Témoignage de démonstration : je me suis entraînée trois fois à l''entretien avant le vrai.', true, now(), true);

-- Parcours anglais
ALTER TABLE public.bourses ADD COLUMN IF NOT EXISTS english_tests JSONB;
UPDATE public.bourses SET english_tests = '[{"test": "ielts", "min_score": 6.5}, {"test": "toefl", "min_score": 90}, {"test": "duolingo", "min_score": 115}]'::jsonb
WHERE id LIKE 'exemple-%' AND english_required AND english_tests IS NULL;

CREATE TABLE public.english_test_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test              TEXT NOT NULL CHECK (test IN ('ielts', 'toefl', 'duolingo')),
  city              TEXT NOT NULL,
  country           TEXT,
  session_date      DATE NOT NULL,
  register_by       DATE,
  cost_indicative   TEXT,
  results_days      INTEGER,
  notes             TEXT
);
GRANT SELECT ON public.english_test_sessions TO anon, authenticated;
GRANT ALL ON public.english_test_sessions TO service_role;
ALTER TABLE public.english_test_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test sessions readable" ON public.english_test_sessions FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.english_test_sessions (test, city, country, session_date, register_by, cost_indicative, results_days, notes) VALUES
('ielts', 'Niamey', 'NE', '2026-11-14', '2026-10-31', '≈ 140 000 FCFA', 13, 'Données de démonstration'),
('ielts', 'Dakar', 'SN', '2026-11-21', '2026-11-07', '≈ 135 000 FCFA', 13, 'Données de démonstration'),
('ielts', 'Abidjan', 'CI', '2026-12-05', '2026-11-20', '≈ 140 000 FCFA', 13, 'Données de démonstration'),
('toefl', 'Bamako', 'ML', '2026-11-28', '2026-11-14', '≈ 150 000 FCFA', 10, 'Données de démonstration'),
('duolingo', 'En ligne', NULL, '2026-10-15', NULL, '≈ 40 000 FCFA', 2, 'Passage à domicile, à tout moment');
