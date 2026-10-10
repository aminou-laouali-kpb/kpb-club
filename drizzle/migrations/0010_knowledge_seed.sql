-- Généré par scripts/build-knowledge.ts : base de connaissances du coach IA
DELETE FROM public.knowledge_chunks WHERE source = 'guide';
INSERT INTO public.knowledge_chunks (source, ref, title, content) VALUES ('guide', '01-introduction', 'Guide, chapitre 1 : Introduction : comprendre le paysage des bourses — Ce que couvre une bourse', 'Une bourse complète couvre généralement les frais de scolarité, un montant de subsistance
mensuel, le billet d''avion et l''assurance santé. Une bourse partielle ne couvre qu''une partie
de ces postes.

- Vérifiez la date limite réelle, pas la date d''annonce.
- Vérifiez les nationalités éligibles.
- Vérifiez le niveau d''études exigé à la date de candidature.

La bourse n''est pas une loterie : c''est un dossier qui répond précisément à des critères.');
INSERT INTO public.knowledge_chunks (source, ref, title, content) VALUES ('guide', '02-choisir-sa-bourse', 'Guide, chapitre 2 : Choisir la bonne fenêtre de candidature — Construire une liste courte', 'Trois programmes ambitieux, trois réalistes, deux de sécurité.

Comptez huit semaines entre le début du dossier et l''envoi.');
INSERT INTO public.knowledge_chunks (source, ref, title, content) VALUES ('guide', '03-constituer-le-dossier', 'Guide, chapitre 3 : Constituer le dossier — Les pièces habituelles', '1. Relevés de notes et diplômes
2. Lettre de motivation
3. CV académique
4. Deux lettres de recommandation
5. Preuve de niveau de langue');
INSERT INTO public.knowledge_chunks (source, ref, title, content) VALUES ('guide', '04-lettre-de-motivation', 'Guide, chapitre 4 : Écrire une lettre de motivation qui tient — Structure', '1. Pourquoi ce domaine
2. Pourquoi ce programme
3. Ce que vous apportez
4. Ce que vous ferez ensuite');
INSERT INTO public.knowledge_chunks (source, ref, title, content) VALUES ('guide', '05-entretien', 'Guide, chapitre 5 : Préparer l''entretien — Les questions récurrentes', '- Parlez-nous de votre parcours.
- Pourquoi notre université ?
- Que ferez-vous après vos études ?');

-- Fiches des bourses (rejouer après une mise à jour du catalogue)
DELETE FROM public.knowledge_chunks WHERE source = 'bourse';
INSERT INTO public.knowledge_chunks (source, ref, title, content)
SELECT 'bourse', b.id, 'Bourse : ' || b.university_name,
  concat_ws(E'\n',
    'Pays : ' || b.country,
    'Niveau minimum : ' || coalesce(b.min_education, 'non précisé'),
    CASE WHEN b.max_age IS NOT NULL THEN 'Âge maximum : ' || b.max_age END,
    CASE WHEN b.english_required THEN 'Anglais requis' ELSE 'Anglais non requis' END,
    CASE WHEN b.gender_restriction = 'F' THEN 'Réservée aux femmes' END,
    CASE WHEN b.financial_need_required THEN 'Réservée aux candidats ayant un besoin de financement' END,
    'Fenêtre de dépôt : du ' || coalesce(to_char(b.window_opens, 'DD/MM/YYYY'), '?') || ' au ' || coalesce(to_char(b.window_closes, 'DD/MM/YYYY'), '?'),
    b.notes)
FROM public.bourses b;
