-- Vérification des migrations 0004 → 0013 (lecture seule : aucune écriture).
-- À coller dans l'éditeur SQL de Supabase, ou à faire exécuter par Lovable.
-- Chaque ligne est un contrôle ; toute ligne avec ok = false indique une migration à rejouer.

WITH checks (migration, controle, ok, detail) AS (
  -- Tables
  SELECT m, 'table ' || t, to_regclass('public.' || t) IS NOT NULL, NULL::text
  FROM (VALUES
    ('0005', 'access_codes'), ('0005', 'access_code_redemptions'), ('0005', 'access_code_attempts'),
    ('0006', 'bourse_requirements'), ('0006', 'applications'), ('0006', 'application_items'),
    ('0007', 'documents'), ('0007', 'recommenders'),
    ('0008', 'referrals'),
    ('0009', 'ai_usage'), ('0009', 'ai_threads'), ('0009', 'ai_messages'), ('0009', 'knowledge_chunks'),
    ('0011', 'otp_codes'), ('0011', 'whatsapp_sessions'), ('0011', 'whatsapp_inbound'),
    ('0011', 'content_chapters'), ('0011', 'content_templates'), ('0011', 'content_posts'),
    ('0011', 'content_post_reads'), ('0011', 'laureates'), ('0011', 'english_test_sessions'),
    ('0013', 'events'), ('0013', 'admin_notes'), ('0013', 'broadcasts')
  ) AS t(m, t)

  UNION ALL
  -- Colonnes témoins
  SELECT m, 'colonne ' || tbl || '.' || col,
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = tbl AND column_name = col), NULL
  FROM (VALUES
    ('0004', 'payments', 'external_id'),
    ('0006', 'bourses', 'operations_order'),
    ('0007', 'application_items', 'document_id'),
    ('0008', 'engagements', 'paid_amount'),
    ('0008', 'profiles', 'referral_code'),
    ('0009', 'bourses', 'essay_criteria'),
    ('0011', 'profiles', 'phone_e164'),
    ('0011', 'notifications', 'template'),
    ('0011', 'bourses', 'english_tests'),
    ('0013', 'bourses', 'published'),
    ('0013', 'profiles', 'deletion_requested_at'),
    ('0013', 'application_items', 'reviewed_by_kpb_at'),
    ('0013', 'notifications', 'broadcast_id')
  ) AS c(m, tbl, col)

  UNION ALL
  -- Fonctions
  SELECT m, 'fonction ' || f,
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = f), NULL
  FROM (VALUES
    ('0005', 'redeem_access_code'), ('0008', 'generate_referral_code'),
    ('0009', 'search_knowledge'), ('0013', 'admin_dashboard_stats'), ('0013', 'admin_activity_months')
  ) AS f(m, f)

  UNION ALL
  -- Inscription : le trigger existe et la version 0013 enregistre l'événement « signup »
  SELECT '0013', 'handle_new_user enregistre signup',
         COALESCE((SELECT prosrc LIKE '%''signup''%' FROM pg_proc WHERE proname = 'handle_new_user'
                   AND pronamespace = 'public'::regnamespace LIMIT 1), false), NULL
  UNION ALL
  SELECT '0000', 'trigger on_auth_user_created',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created'), NULL

  UNION ALL
  -- Coffre-fort
  SELECT '0007', 'bucket documents (privé)',
         CASE WHEN to_regclass('storage.buckets') IS NULL THEN false
              ELSE (xpath('/row/c/text()', query_to_xml(
                'SELECT count(*) AS c FROM storage.buckets WHERE id = ''documents'' AND NOT public',
                false, true, '')))[1]::text::int = 1 END, NULL

  UNION ALL
  -- RLS activée sur les nouvelles tables
  SELECT '0005-0013', 'RLS activée partout',
         NOT EXISTS (
           SELECT 1 FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
             AND c.relname IN ('access_codes', 'access_code_redemptions', 'access_code_attempts',
               'bourse_requirements', 'applications', 'application_items', 'documents', 'recommenders',
               'referrals', 'ai_usage', 'ai_threads', 'ai_messages', 'knowledge_chunks', 'otp_codes',
               'whatsapp_sessions', 'whatsapp_inbound', 'content_chapters', 'content_templates',
               'content_posts', 'content_post_reads', 'laureates', 'english_test_sessions',
               'events', 'admin_notes', 'broadcasts')
             AND NOT c.relrowsecurity),
         (SELECT string_agg(c.relname, ', ') FROM pg_class c
          WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT c.relrowsecurity
            AND c.relname IN ('access_codes', 'documents', 'events', 'otp_codes', 'knowledge_chunks', 'broadcasts', 'admin_notes'))

  UNION ALL
  -- Droits : le guide payant n'est plus lisible sans connexion (0013)
  SELECT '0013', 'knowledge_chunks fermé au public',
         CASE WHEN to_regclass('public.knowledge_chunks') IS NULL THEN false
              ELSE NOT has_table_privilege('anon', 'public.knowledge_chunks', 'SELECT') END, NULL

  UNION ALL
  -- Données (-1 = table absente)
  SELECT '0010', 'base de connaissances du coach (≥ 11 extraits)', (CASE WHEN to_regclass('public.knowledge_chunks') IS NULL THEN -1 ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.knowledge_chunks', false, true, '')))[1]::text::int END) >= 11, (CASE WHEN to_regclass('public.knowledge_chunks') IS NULL THEN -1 ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.knowledge_chunks', false, true, '')))[1]::text::int END)::text
  UNION ALL
  SELECT '0012', 'chapitres du guide (≥ 5)', (CASE WHEN to_regclass('public.content_chapters') IS NULL THEN -1 ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.content_chapters', false, true, '')))[1]::text::int END) >= 5, (CASE WHEN to_regclass('public.content_chapters') IS NULL THEN -1 ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.content_chapters', false, true, '')))[1]::text::int END)::text
  UNION ALL
  SELECT '0012', 'modèles (≥ 4)', (CASE WHEN to_regclass('public.content_templates') IS NULL THEN -1 ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.content_templates', false, true, '')))[1]::text::int END) >= 4, (CASE WHEN to_regclass('public.content_templates') IS NULL THEN -1 ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.content_templates', false, true, '')))[1]::text::int END)::text
  UNION ALL
  SELECT '0011', 'sessions de tests d''anglais (démo)', (CASE WHEN to_regclass('public.english_test_sessions') IS NULL THEN -1 ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.english_test_sessions', false, true, '')))[1]::text::int END) >= 1, (CASE WHEN to_regclass('public.english_test_sessions') IS NULL THEN -1 ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.english_test_sessions', false, true, '')))[1]::text::int END)::text
)
SELECT migration, controle, ok, detail
FROM checks
ORDER BY ok, migration, controle;
