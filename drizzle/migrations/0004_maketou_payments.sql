-- Paiement en ligne via Maketou (checkout créé par API, confirmation par webhook)
ALTER TYPE public.payment_provider ADD VALUE IF NOT EXISTS 'maketou';
ALTER TYPE public.payment_provider ADD VALUE IF NOT EXISTS 'promo';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS external_id  TEXT,
  ADD COLUMN IF NOT EXISTS checkout_url TEXT;

-- Un même identifiant de transaction ne peut valider qu'un seul paiement (webhook idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_transaction_ref_key
  ON public.payments (provider, transaction_ref)
  WHERE transaction_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_external_id ON public.payments (external_id);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'payment'
    CHECK (source IN ('payment', 'promo', 'grant', 'referral')),
  ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL;

-- Les paiements sont désormais créés uniquement côté serveur (service role)
DROP POLICY IF EXISTS "own payments insert" ON public.payments;
REVOKE INSERT ON public.payments FROM authenticated;
