-- Accompagnement en 2 tranches, parrainage, relances dans le fuseau du membre

-- Accompagnement
ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS application_id         UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installments           INTEGER NOT NULL DEFAULT 1 CHECK (installments IN (1, 2)),
  ADD COLUMN IF NOT EXISTS paid_amount            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_applied         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS second_due_at          DATE,
  ADD COLUMN IF NOT EXISTS reminder_t2_j5_sent    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_t2_j1_sent    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_t2_j0_sent    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_t2_jp3_sent   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_agent         UUID;
ALTER TABLE public.engagements ALTER COLUMN university DROP NOT NULL;
ALTER TABLE public.engagements ALTER COLUMN window_year DROP NOT NULL;
CREATE POLICY "admin engagements select" ON public.engagements
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Profils : fuseau, parrainage, ambassadeurs
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text;
BEGIN
  LOOP
    result := 'KPB-';
    FOR i IN 1..6 LOOP
      result := result || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = result);
  END LOOP;
  RETURN result;
END; $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone      TEXT NOT NULL DEFAULT 'Africa/Niamey',
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_ambassador BOOLEAN NOT NULL DEFAULT false;

UPDATE public.profiles SET referral_code = public.generate_referral_code() WHERE referral_code IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, email, full_name, referral_code)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
          public.generate_referral_code())
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- Parrainage
CREATE TABLE public.referrals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id            UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  status                 TEXT NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'paid', 'rewarded')),
  paid_at                TIMESTAMPTZ,
  rewarded_at            TIMESTAMPTZ,
  reward_subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (referrer_id <> referred_id)
);
CREATE INDEX idx_referrals_referrer ON public.referrals (referrer_id, status);
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own referrals select" ON public.referrals
  FOR SELECT TO authenticated
  USING (
    referrer_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Notifications : envoi différé dans la fenêtre 8 h – 20 h locale
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS send_after TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS notifications_due_idx ON public.notifications (status, send_after);

-- Sécurité : un membre ne modifie que ses champs de profil ordinaires.
-- Le crédit, le parrainage, le statut d'ambassadeur et l'onboarding passent par le serveur.
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;
GRANT INSERT (auth_user_id, email, full_name) ON public.profiles TO authenticated;
GRANT UPDATE (
  full_name, phone, date_of_birth, gender, nationality, residence, education,
  field_of_study, english_level, financial_need, whatsapp_optin, email_optin, timezone
) ON public.profiles TO authenticated;