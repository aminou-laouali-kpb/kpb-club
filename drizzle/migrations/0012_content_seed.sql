-- Généré par scripts/build-content.ts : contenus du guide et modèles
INSERT INTO public.content_chapters (slug, title, summary, body_md, sort_order, published) VALUES ('01-introduction', 'Introduction : comprendre le paysage des bourses', 'Ce que finance réellement une bourse, et comment lire une offre.', '_Contenu provisoire — à remplacer par le texte définitif._

## Ce que couvre une bourse

Une bourse complète couvre généralement les frais de scolarité, un montant de subsistance
mensuel, le billet d''avion et l''assurance santé. Une bourse partielle ne couvre qu''une partie
de ces postes.

## Lire une offre correctement

- Vérifiez la date limite réelle, pas la date d''annonce.
- Vérifiez les nationalités éligibles.
- Vérifiez le niveau d''études exigé à la date de candidature.

## À retenir

La bourse n''est pas une loterie : c''est un dossier qui répond précisément à des critères.', 1, true) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.content_chapters (slug, title, summary, body_md, sort_order, published) VALUES ('02-choisir-sa-bourse', 'Choisir la bonne fenêtre de candidature', 'Cibler trois à cinq programmes réellement atteignables.', '_Contenu provisoire — à remplacer par le texte définitif._

## Construire une liste courte

Trois programmes ambitieux, trois réalistes, deux de sécurité.

## Le calendrier

Comptez huit semaines entre le début du dossier et l''envoi.', 2, true) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.content_chapters (slug, title, summary, body_md, sort_order, published) VALUES ('03-constituer-le-dossier', 'Constituer le dossier', 'Pièces exigées, traductions, légalisations, délais.', '_Contenu provisoire — à remplacer par le texte définitif._

## Les pièces habituelles

1. Relevés de notes et diplômes
2. Lettre de motivation
3. CV académique
4. Deux lettres de recommandation
5. Preuve de niveau de langue', 3, true) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.content_chapters (slug, title, summary, body_md, sort_order, published) VALUES ('04-lettre-de-motivation', 'Écrire une lettre de motivation qui tient', 'Structure en quatre temps et erreurs fréquentes.', '_Contenu provisoire — à remplacer par le texte définitif._

## Structure

1. Pourquoi ce domaine
2. Pourquoi ce programme
3. Ce que vous apportez
4. Ce que vous ferez ensuite', 4, true) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.content_chapters (slug, title, summary, body_md, sort_order, published) VALUES ('05-entretien', 'Préparer l''entretien', 'Les dix questions qui reviennent presque toujours.', '_Contenu provisoire — à remplacer par le texte définitif._

## Les questions récurrentes

- Parlez-nous de votre parcours.
- Pourquoi notre université ?
- Que ferez-vous après vos études ?', 5, true) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.content_templates (slug, title, summary, category, body_md, prefill, published, sort_order) VALUES ('cv-academique', 'CV académique', 'Format une page, orienté recherche et résultats.', 'cv', '_Contenu provisoire — à remplacer par le texte définitif._

## Structure du CV

**{{full_name}}** — {{residence}} — {{email}} — {{phone}}

### Formation
Année — Diplôme — Établissement — Mention

### Expériences
Année — Poste — Organisation — Résultat mesurable

### Compétences et langues', true, true, 1) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.content_templates (slug, title, summary, category, body_md, prefill, published, sort_order) VALUES ('lettre-motivation', 'Lettre de motivation', 'Modèle en quatre paragraphes, adaptable à tout programme.', 'motivation', '{{full_name}}
{{residence}}

_Contenu provisoire — à remplacer par le texte définitif._

Madame, Monsieur,

Paragraphe 1 — l''intention.

Paragraphe 2 — le parcours.

Paragraphe 3 — l''adéquation avec le programme.

Paragraphe 4 — le projet après le diplôme.', true, true, 2) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.content_templates (slug, title, summary, category, body_md, prefill, published, sort_order) VALUES ('essai-personnel', 'Essai personnel', 'Récit structuré autour d''un obstacle et d''un apprentissage.', 'essay', '_Contenu provisoire — à remplacer par le texte définitif._

## Plan conseillé

1. Une scène concrète
2. Ce qu''elle a changé
3. Le lien avec vos études
4. Ce que vous visez', false, true, 3) ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.content_templates (slug, title, summary, category, body_md, prefill, published, sort_order) VALUES ('lettre-recommandation', 'Lettre de recommandation', 'Trame à remettre à votre référent pour lui faciliter la tâche.', 'recommendation', '_Contenu provisoire — à remplacer par le texte définitif._

## Trame pour le référent

- Depuis quand et dans quel cadre il vous connaît
- Deux qualités illustrées par des faits
- Une comparaison avec d''autres étudiants
- Une recommandation explicite', false, true, 4) ON CONFLICT (slug) DO NOTHING;

-- Bibliothèque : publications de démonstration
INSERT INTO public.content_posts (kind, title, body_md, url, notify, published_at) VALUES
('method', 'Méthode : 5 erreurs qui coûtent une bourse (démo)', 'Publication de démonstration à remplacer. Date limite mal lue, lettre générique, pièce manquante, recommandation tardive, essai trop long.', NULL, false, now()),
('video', 'L''université décortiquée : Sciences Po (démo)', 'Vidéo de démonstration à remplacer.', 'https://www.youtube.com/', false, now()),
('news', 'Bulletin du lundi (démo)', 'Publication de démonstration : les fenêtres qui ouvrent cette semaine.', NULL, false, now());
