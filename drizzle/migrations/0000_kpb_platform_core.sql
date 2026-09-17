-- ENUMS
CREATE TYPE public.subscription_plan AS ENUM ('monthly', 'quarterly');
CREATE TYPE public.subscription_status AS ENUM ('active', 'grace', 'expired', 'cancelled');
CREATE TYPE public.engagement_status AS ENUM ('pending_payment','active','documents_review','submitted','completed','cancelled');
CREATE TYPE public.payment_status AS ENUM ('pending','success','failed','refunded');
CREATE TYPE public.payment_provider AS ENUM ('wave','orange_money','mtn_momo','moov_money','manual');
CREATE TYPE public.payable_type AS ENUM ('subscription','engagement');

-- PROFILES
CREATE TABLE public.profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   UUID UNIQUE NOT NULL,
  member_code    TEXT NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,4)),
  phone          TEXT,
  email          TEXT,
  full_name      TEXT NOT NULL DEFAULT '',
  date_of_birth  DATE,
  gender         TEXT CHECK (gender IN ('M','F','other')),
  nationality    TEXT,
  residence      TEXT,
  education      TEXT CHECK (education IN ('bac','licence','master','doctorat','autre')),
  field_of_study TEXT,
  english_level  TEXT CHECK (english_level IN ('none','basic','intermediate','advanced','native')),
  financial_need BOOLEAN NOT NULL DEFAULT true,
  credit_balance INTEGER NOT NULL DEFAULT 0,
  whatsapp_optin BOOLEAN NOT NULL DEFAULT true,
  email_optin    BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());
CREATE INDEX idx_profiles_nationality ON public.profiles(nationality);
CREATE INDEX idx_profiles_education ON public.profiles(education);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SUBSCRIPTIONS
CREATE TABLE public.subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan          public.subscription_plan NOT NULL,
  amount        INTEGER NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at       TIMESTAMPTZ NOT NULL,
  status        public.subscription_status NOT NULL DEFAULT 'active',
  grace_ends_at TIMESTAMPTZ,
  reminder_j7_sent    BOOLEAN NOT NULL DEFAULT false,
  reminder_j2_sent    BOOLEAN NOT NULL DEFAULT false,
  reminder_j0_sent    BOOLEAN NOT NULL DEFAULT false,
  reminder_grace_sent BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscriptions" ON public.subscriptions FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));
CREATE INDEX idx_subscriptions_profile ON public.subscriptions(profile_id);
CREATE INDEX idx_subscriptions_ends_at ON public.subscriptions(ends_at);

-- ENGAGEMENTS
CREATE TABLE public.engagements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bourse_id    TEXT,
  university   TEXT NOT NULL,
  window_year  INTEGER NOT NULL,
  status       public.engagement_status NOT NULL DEFAULT 'pending_payment',
  amount       INTEGER NOT NULL,
  package_type TEXT CHECK (package_type IN ('single','three_windows','all_windows','concierge')),
  deadline     DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.engagements TO authenticated;
GRANT ALL ON public.engagements TO service_role;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own engagements" ON public.engagements FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));
CREATE TRIGGER engagements_touch BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- PAYMENTS
CREATE TABLE public.payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payable_type    public.payable_type NOT NULL,
  payable_id      UUID,
  amount          INTEGER NOT NULL,
  provider        public.payment_provider NOT NULL DEFAULT 'manual',
  transaction_ref TEXT,
  status          public.payment_status NOT NULL DEFAULT 'pending',
  paid_at         TIMESTAMPTZ,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payments select" ON public.payments FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY "own payments insert" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()) AND status = 'pending');
CREATE INDEX idx_payments_profile ON public.payments(profile_id);

-- BOURSES
CREATE TABLE public.bourses (
  id                      TEXT PRIMARY KEY,
  university_name         TEXT NOT NULL,
  country                 TEXT NOT NULL,
  program_url             TEXT,
  eligible_nationalities  TEXT[] NOT NULL DEFAULT '{}',
  gender_restriction      TEXT NOT NULL DEFAULT 'all' CHECK (gender_restriction IN ('F','all')),
  min_education           TEXT,
  max_age                 INTEGER,
  english_required        BOOLEAN NOT NULL DEFAULT false,
  financial_need_required BOOLEAN NOT NULL DEFAULT false,
  window_opens            DATE,
  window_closes           DATE,
  window_confirmed        BOOLEAN NOT NULL DEFAULT false,
  academic_year           INTEGER,
  notes                   TEXT,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bourses TO anon, authenticated;
GRANT ALL ON public.bourses TO service_role;
ALTER TABLE public.bourses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bourses readable" ON public.bourses FOR SELECT TO anon, authenticated USING (true);

-- ALERTS LOG
CREATE TABLE public.alerts_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bourse_id  TEXT NOT NULL REFERENCES public.bourses(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL CHECK (channel IN ('whatsapp','email')),
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, bourse_id, channel)
);
GRANT SELECT ON public.alerts_log TO authenticated;
GRANT ALL ON public.alerts_log TO service_role;
ALTER TABLE public.alerts_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own alerts" ON public.alerts_log FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

INSERT INTO public.bourses (id, university_name, country, program_url, eligible_nationalities, gender_restriction, min_education, max_age, english_required, financial_need_required, window_opens, window_closes, window_confirmed, academic_year, notes) VALUES
('exemple-sciences-po','Sciences Po Paris (EXEMPLE)','FR','https://www.sciencespo.fr','{}','all','licence',30,false,true,'2026-10-01','2027-01-15',true,2027,'Donnee d''exemple - a remplacer'),
('exemple-uottawa','Universite d''Ottawa (EXEMPLE)','CA','https://www.uottawa.ca','{}','all','licence',35,true,false,'2026-09-15','2026-12-01',true,2027,'Donnee d''exemple - a remplacer'),
('exemple-kaist','KAIST (EXEMPLE)','KR','https://www.kaist.ac.kr','{}','all','licence',32,true,false,'2026-11-01','2027-03-31',true,2027,'Donnee d''exemple - a remplacer'),
('exemple-femmes-afrique','Bourse Femmes Leaders Afrique (EXEMPLE)','MA',NULL,'{"NE","SN","ML","BF","CI","TG","BJ"}','F','bac',28,false,true,'2026-09-20','2026-12-20',true,2027,'Donnee d''exemple - a remplacer'),
('exemple-erasmus','Erasmus Mundus (EXEMPLE)','BE','https://erasmus-plus.ec.europa.eu','{}','all','licence',NULL,true,false,'2026-10-15','2027-02-15',true,2027,'Donnee d''exemple - a remplacer'),
('exemple-tokyo','University of Tokyo (EXEMPLE)','JP',NULL,'{}','all','master',35,true,false,'2026-12-01','2027-04-30',true,2027,'Donnee d''exemple - a remplacer');
