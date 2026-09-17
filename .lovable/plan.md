# KPB Education — Plateforme Membre (première version)

Une seule application : le vérificateur d'éligibilité est la porte d'entrée publique, l'espace membre est la zone connectée.

## Ce que vous obtiendrez

**Pages publiques**
- Accueil : présentation du Club Boursier, arguments, tarifs (15 000 FCFA/mois, 30 000 FCFA/trimestre), appel à l'action vers le vérificateur.
- Vérificateur : formulaire en plusieurs étapes (identité, nationalité, résidence, niveau d'études, domaine, anglais, besoin financier, date de naissance). Résultat immédiat listant les bourses correspondantes, puis invitation à créer un compte pour sauvegarder le profil.
- Connexion / inscription : email + mot de passe, plus connexion Google.

**Espace membre (connexion requise)**
- Tableau de bord : état de l'abonnement (actif, période de grâce, expiré, aucun), jours restants, crédit accompagnement, bourses correspondant au profil, accès rapide au guide et aux modèles.
- Guide : sommaire + pages de chapitres, affichés avec votre nom en filigrane, texte non sélectionnable, aucun téléchargement.
- Modèles : CV, lettre de motivation, essai, lettre de recommandation — mêmes protections.
- Compte : modification du profil, historique des paiements, gestion de l'abonnement.
- Accès au guide et aux modèles réservé aux abonnements actifs ou en grâce ; sinon message et lien vers l'offre.

**Navigation mobile d'abord** : barre de navigation basse sur téléphone, tout lisible dès 375 px.

## Contenu

Les pages du guide, des modèles et la liste des bourses seront alimentées par vos textes. Je crée la structure avec quelques entrées marquées « à remplacer » pour que vous puissiez voir le rendu et les remplacer ensuite.

## Non inclus à cette étape

- Paiement mobile money automatique. À la place : une page d'offre qui enregistre l'intention d'achat, et l'abonnement est activé manuellement depuis la base en attendant. Le modèle de données est prêt pour brancher MoneyFusion ensuite.
- Rappels WhatsApp et email automatiques, alertes quotidiennes, connexion par SMS, limite de sessions simultanées. Les champs nécessaires (drapeaux de relance, journal d'alertes) sont créés dès maintenant.

## Détails techniques

Stack imposé par la plateforme : TanStack Start (React + Vite) avec Lovable Cloud (Postgres, authentification, stockage) — pas Next.js/Vercel/n8n. Les concepts de la spécification sont transposés :

- Routes de fichiers sous `src/routes/` : `index`, `verificateur`, `auth`, et sous-arbre protégé `_authenticated/` pour `dashboard`, `guide`, `guide/$chapter`, `templates`, `templates/$slug`, `compte`, `offre`.
- Tables créées par migration, avec GRANTs et RLS : `profiles` (lié à `auth.users`, `credit_balance`), `subscriptions` (énumérations plan/statut, `grace_ends_at`, drapeaux de relance), `engagements`, `payments` (polymorphe), `bourses`, `alerts_log`. RLS scopée par `auth.uid()`, plus lecture publique restreinte sur `bourses`.
- Trigger de création de profil à l'inscription ; le profil du vérificateur (stocké localement avant connexion) est fusionné dans `profiles` après authentification.
- Moteur de correspondance en TypeScript partagé (`src/lib/matching.ts`) : 7 critères ET (nationalité, genre, niveau minimum, âge maximum, anglais, besoin financier, fenêtre ouverte ou ≤ 60 jours) — utilisé côté public et côté membre.
- Constantes tarifaires et logique de renouvellement/crédit dans `src/lib/pricing.ts` (crédit 5 000/mois, plafond 15 000, remise appliquée à l'engagement).
- Lectures membres via server functions authentifiées ; lecture publique des bourses via client publiable.
- Filigrane : superposition CSS `::after` avec « NOM — KPB-XXXX », `user-select: none`, pas de lien de téléchargement.
- Design : identité propre à KPB (typographie et palette dédiées en jetons sémantiques), pas de dégradé violet générique.
