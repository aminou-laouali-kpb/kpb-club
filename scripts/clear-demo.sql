-- Retire le jeu de démonstration créé par scripts/seed-demo.sql.
-- Les membres fictifs sont supprimés (avec tout ce qui en dépend) ; le compte démo est
-- remis à zéro (candidatures, abonnements, paiements, accompagnement marqués démo).

DO $$
DECLARE
  demo_contact CONSTANT TEXT := '+22790000001';  -- même valeur que dans seed-demo.sql
  demo_id UUID;
BEGIN
  DELETE FROM public.events
  WHERE profile_id IN (SELECT id FROM public.profiles WHERE email LIKE '%@demo.kpb.invalid');
  DELETE FROM public.engagements
  WHERE profile_id IN (SELECT id FROM public.profiles WHERE email LIKE '%@demo.kpb.invalid');
  DELETE FROM public.payments
  WHERE profile_id IN (SELECT id FROM public.profiles WHERE email LIKE '%@demo.kpb.invalid');
  DELETE FROM public.profiles WHERE email LIKE '%@demo.kpb.invalid';

  SELECT id INTO demo_id FROM public.profiles
  WHERE phone_e164 = demo_contact OR lower(email) = lower(demo_contact)
  LIMIT 1;
  IF demo_id IS NOT NULL THEN
    DELETE FROM public.engagements WHERE profile_id = demo_id AND notes = 'Démo';
    DELETE FROM public.payments WHERE profile_id = demo_id AND metadata->>'demo' = 'true';
    DELETE FROM public.subscriptions WHERE profile_id = demo_id AND payment_id IS NULL AND source = 'payment';
    DELETE FROM public.applications WHERE profile_id = demo_id;
  END IF;
END $$;
