-- Codes d'accès au Club (16 caractères) : accès gratuit pendant N jours
CREATE TABLE public.access_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{16}$'),
  batch_label   TEXT,
  duration_days INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 730),
  max_uses      INTEGER NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
  uses_count    INTEGER NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.access_codes TO service_role;
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin access codes select" ON public.access_codes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.access_code_redemptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id         UUID NOT NULL REFERENCES public.access_codes(id) ON DELETE CASCADE,
  profile_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  redeemed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code_id, profile_id)
);
CREATE INDEX idx_access_code_redemptions_profile ON public.access_code_redemptions (profile_id);
GRANT SELECT ON public.access_code_redemptions TO authenticated;
GRANT ALL ON public.access_code_redemptions TO service_role;
ALTER TABLE public.access_code_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own redemptions select" ON public.access_code_redemptions
  FOR SELECT TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Journal des tentatives, pour limiter les essais (anti force brute)
CREATE TABLE public.access_code_attempts (
  id           BIGSERIAL PRIMARY KEY,
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  success      BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_access_code_attempts_profile_time
  ON public.access_code_attempts (profile_id, attempted_at DESC);
GRANT ALL ON public.access_code_attempts TO service_role;
ALTER TABLE public.access_code_attempts ENABLE ROW LEVEL SECURITY;

-- Consommation atomique d'un code : verrouille la ligne, contrôle et incrémente.
-- Renvoie la durée accordée et l'id de la redemption, ou une erreur explicite.
CREATE OR REPLACE FUNCTION public.redeem_access_code(_profile_id UUID, _code TEXT)
RETURNS TABLE (redemption_id UUID, duration_days INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.access_codes%ROWTYPE;
  r_id UUID;
BEGIN
  SELECT * INTO c FROM public.access_codes WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'code_invalid'; END IF;
  IF NOT c.active THEN RAISE EXCEPTION 'code_inactive'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN RAISE EXCEPTION 'code_expired'; END IF;
  IF c.uses_count >= c.max_uses THEN RAISE EXCEPTION 'code_exhausted'; END IF;
  IF EXISTS (SELECT 1 FROM public.access_code_redemptions
             WHERE code_id = c.id AND profile_id = _profile_id) THEN
    RAISE EXCEPTION 'code_already_used';
  END IF;

  UPDATE public.access_codes SET uses_count = uses_count + 1 WHERE id = c.id;
  INSERT INTO public.access_code_redemptions (code_id, profile_id)
    VALUES (c.id, _profile_id) RETURNING id INTO r_id;

  RETURN QUERY SELECT r_id, c.duration_days;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_access_code(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_access_code(UUID, TEXT) TO service_role;