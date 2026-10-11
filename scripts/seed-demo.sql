-- Jeu de démonstration (hors migrations : à lancer à la main dans l'éditeur SQL de Supabase).
--
-- 1. Créez d'abord le compte démo sur le site : connexion par code WhatsApp avec le numéro
--    choisi ci-dessous (ou par email), pour que le compte de connexion existe.
-- 2. Remplacez si besoin le numéro / l'email dans la ligne `demo_contact`, puis exécutez.
-- 3. Pour tout retirer : scripts/clear-demo.sql.
--
-- Le script complète ce compte (profil nigérien, Club actif, 2 candidatures à des stades
-- différents, accompagnement en cours, un filleul) et crée 24 membres fictifs non
-- connectables (adresse @demo.kpb.invalid) répartis sur 6 mois, pour que le tableau de
-- bord admin (MRR, churn, cohortes, entonnoir) ne soit pas vide.
-- Aucun document n'est créé : déposez une photo pendant la démo pour montrer le coffre-fort.

DO $$
DECLARE
  demo_contact CONSTANT TEXT := '+22790000001';  -- numéro WhatsApp (E.164) ou email du compte démo
  demo_id   UUID;
  app1      UUID;
  app2      UUID;
  fake_id   UUID;
  sub_id    UUID;
  i         INTEGER;
  joined    TIMESTAMPTZ;
  b1        TEXT;
  b2        TEXT;
BEGIN
  SELECT id INTO demo_id FROM public.profiles
  WHERE phone_e164 = demo_contact OR lower(email) = lower(demo_contact)
  LIMIT 1;
  IF demo_id IS NULL THEN
    RAISE EXCEPTION 'Compte démo introuvable pour % : connectez-vous d''abord une fois sur le site.', demo_contact;
  END IF;

  -- Deux bourses publiées, de préférence ouvertes aux femmes et aux Nigériens
  SELECT id INTO b1 FROM public.bourses WHERE published ORDER BY (gender_restriction = 'F') DESC, window_closes NULLS LAST LIMIT 1;
  SELECT id INTO b2 FROM public.bourses WHERE published AND id <> b1 ORDER BY window_closes NULLS LAST LIMIT 1;

  UPDATE public.profiles SET
    full_name = 'Mariama Issoufou (démo)',
    gender = 'F',
    nationality = 'NE',
    residence = 'NE',
    education = 'licence',
    field_of_study = 'Économie',
    english_level = 'intermediate',
    financial_need = true,
    onboarding_completed = true,
    consent_at = now(),
    consent_version = '2026-10',
    timezone = 'Africa/Niamey'
  WHERE id = demo_id;

  -- Club actif (paiement trimestriel il y a 20 jours)
  INSERT INTO public.subscriptions (profile_id, plan, amount, starts_at, ends_at, grace_ends_at, status, source)
  VALUES (demo_id, 'quarterly', 30000, now() - interval '20 days', now() + interval '70 days', now() + interval '73 days', 'active', 'payment');
  INSERT INTO public.payments (profile_id, payable_type, amount, provider, status, paid_at, metadata)
  VALUES (demo_id, 'subscription', 30000, 'maketou', 'success', now() - interval '20 days', '{"plan": "quarterly", "demo": true}');

  -- Candidature 1 : bien avancée ; candidature 2 : démarrage
  INSERT INTO public.applications (profile_id, bourse_id, status, deadline)
  SELECT demo_id, b1, 'preparing', window_closes FROM public.bourses WHERE id = b1
  ON CONFLICT (profile_id, bourse_id) DO UPDATE SET status = 'preparing'
  RETURNING id INTO app1;
  INSERT INTO public.applications (profile_id, bourse_id, status, deadline)
  SELECT demo_id, b2, 'targeting', window_closes FROM public.bourses WHERE id = b2
  ON CONFLICT (profile_id, bourse_id) DO UPDATE SET status = 'targeting'
  RETURNING id INTO app2;

  DELETE FROM public.application_items WHERE application_id IN (app1, app2);
  INSERT INTO public.application_items (application_id, requirement_id, kind, label, description, essay_prompt, essay_max_words, status, sort_order, completed_at, due_date)
  SELECT app1, r.id, r.kind, r.label, r.description, r.essay_prompt, r.essay_max_words,
         CASE WHEN r.sort_order <= 3 THEN 'done'::public.item_status
              WHEN r.sort_order = 4 THEN 'in_progress'::public.item_status
              ELSE 'todo'::public.item_status END,
         r.sort_order,
         CASE WHEN r.sort_order <= 3 THEN now() - (r.sort_order || ' days')::interval END,
         a.deadline - COALESCE(r.days_before_deadline, 7)
  FROM public.bourse_requirements r JOIN public.applications a ON a.id = app1
  WHERE r.bourse_id = b1;
  INSERT INTO public.application_items (application_id, requirement_id, kind, label, description, essay_prompt, essay_max_words, status, sort_order, due_date)
  SELECT app2, r.id, r.kind, r.label, r.description, r.essay_prompt, r.essay_max_words, 'todo', r.sort_order,
         a.deadline - COALESCE(r.days_before_deadline, 7)
  FROM public.bourse_requirements r JOIN public.applications a ON a.id = app2
  WHERE r.bourse_id = b2;
  -- Sans exigences en base : une checklist minimale
  IF NOT EXISTS (SELECT 1 FROM public.application_items WHERE application_id = app1) THEN
    INSERT INTO public.application_items (application_id, kind, label, status, sort_order, completed_at) VALUES
      (app1, 'document', 'Passeport', 'done', 1, now() - interval '5 days'),
      (app1, 'document', 'Relevés de notes', 'done', 2, now() - interval '3 days'),
      (app1, 'essay', 'Lettre de motivation', 'in_progress', 3, NULL),
      (app1, 'recommendation', 'Lettre de recommandation', 'todo', 4, NULL);
  END IF;
  UPDATE public.applications a SET readiness = sub.pct
  FROM (
    SELECT application_id,
           round(100.0 * count(*) FILTER (WHERE status IN ('done', 'na')) / greatest(count(*), 1))::int AS pct
    FROM public.application_items WHERE application_id IN (app1, app2) GROUP BY application_id
  ) sub
  WHERE a.id = sub.application_id;

  -- Accompagnement « une fenêtre », 1re tranche payée
  INSERT INTO public.engagements (profile_id, bourse_id, application_id, university, window_year, status, amount, package_type, installments, paid_amount, second_due_at, notes)
  SELECT demo_id, b1, app1, university_name, academic_year, 'documents_review', 90000, 'single', 2, 45000, (now() + interval '10 days')::date, 'Démo'
  FROM public.bourses WHERE id = b1;

  -- Membres fictifs (non connectables) : cohortes, churn, entonnoir
  FOR i IN 1..24 LOOP
    joined := date_trunc('month', now()) - ((i % 6) || ' months')::interval + ((i * 3 % 27) || ' days')::interval;
    INSERT INTO public.profiles (auth_user_id, email, full_name, nationality, residence, created_at, consent_at, consent_version)
    VALUES (gen_random_uuid(), 'membre' || i || '@demo.kpb.invalid', 'Membre démo ' || i,
            (ARRAY['NE', 'SN', 'CI', 'ML', 'BF', 'CM'])[1 + i % 6], (ARRAY['NE', 'SN', 'CI', 'ML', 'BF', 'CM'])[1 + i % 6],
            joined, joined, '2026-10')
    RETURNING id INTO fake_id;

    INSERT INTO public.events (profile_id, name, created_at) VALUES (fake_id, 'signup', joined);
    INSERT INTO public.events (profile_id, name, created_at)
    SELECT fake_id, (ARRAY['chapter_read', 'item_done', 'application_created', 'doc_uploaded', 'essay_reviewed'])[1 + (i + g) % 5],
           joined + (g * 9 || ' days')::interval
    FROM generate_series(0, 2 + i % 7) g
    WHERE joined + (g * 9 || ' days')::interval < now();

    -- Un sur deux passe au Club ; certains ne renouvellent pas
    IF i % 2 = 0 THEN
      INSERT INTO public.subscriptions (profile_id, plan, amount, starts_at, ends_at, grace_ends_at, status, source)
      VALUES (fake_id, CASE WHEN i % 4 = 0 THEN 'quarterly' ELSE 'monthly' END::public.subscription_plan,
              CASE WHEN i % 4 = 0 THEN 30000 ELSE 15000 END,
              joined + interval '2 days',
              CASE WHEN i % 4 = 2 THEN joined + interval '32 days' ELSE now() + ((i % 25) || ' days')::interval END,
              CASE WHEN i % 4 = 2 THEN joined + interval '35 days' ELSE now() + ((i % 25 + 3) || ' days')::interval END,
              'active', 'payment')
      RETURNING id INTO sub_id;
      INSERT INTO public.events (profile_id, name, created_at) VALUES (fake_id, 'payment_success', joined + interval '2 days');
      IF i % 4 = 2 AND joined + interval '42 days' < now() THEN
        -- Dernière activité la semaine avant la fin d'accès, puis départ 7 jours après
        INSERT INTO public.events (profile_id, name, created_at) VALUES
          (fake_id, 'chapter_read', joined + interval '30 days'),
          (fake_id, 'coach_used', joined + interval '31 days');
        INSERT INTO public.events (profile_id, name, props, created_at)
        VALUES (fake_id, 'churned', jsonb_build_object('subscription_id', sub_id, 'demo', true), joined + interval '42 days');
      END IF;
    END IF;
    IF i % 8 = 0 THEN
      INSERT INTO public.engagements (profile_id, university, status, amount, package_type, installments, paid_amount)
      VALUES (fake_id, 'Démo', 'active', 90000, 'single', 2, 45000);
    END IF;
    -- Le premier membre fictif est le filleul du compte démo
    IF i = 2 THEN
      INSERT INTO public.referrals (referrer_id, referred_id, status, paid_at)
      VALUES (demo_id, fake_id, 'paid', joined + interval '2 days')
      ON CONFLICT (referred_id) DO NOTHING;
    END IF;
  END LOOP;

  RAISE NOTICE 'Démo prête pour % (bourses % et %).', demo_contact, b1, b2;
END $$;
