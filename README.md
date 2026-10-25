# KPB Club

Plateforme membre de KPB Education. Elle sert deux offres sur une base utilisateur commune :

- **Club Boursier** : abonnement (15 000 FCFA/mois ou 30 000 FCFA/trimestre) donnant accès au guide, aux modèles, aux alertes de bourses et au coach IA.
- **Accompagnement** : achat d'un accompagnement de candidature (90 000 à 690 000 FCFA), payable en deux tranches. Le crédit Club accumulé (5 000 FCFA/mois, plafond 15 000) s'impute sur la première tranche.

Grilles tarifaires : `src/lib/pricing.ts`.

## Fonctionnalités

| Domaine | Description | Code |
|---|---|---|
| Vérificateur d'éligibilité | Formulaire public qui crée le profil | `src/routes/verificateur.tsx` |
| Connexion | Code à usage unique par WhatsApp, SMS de secours ; 2 sessions simultanées max | `src/lib/otp.*`, `src/lib/sessions.functions.ts` |
| Paiement | Maketou (mobile money), webhook idempotent + rapprochement quotidien ; codes d'accès Club | `src/lib/payments.*`, `src/lib/maketou.server.ts`, `src/lib/access-codes.ts` |
| Contenu | Guide et modèles filigranés, bibliothèque, parcours anglais | `src/routes/_authenticated/{guide,templates,bibliotheque,anglais}*` |
| Candidatures | Tracker : checklist, score de préparation, prochaine action | `src/lib/applications.*` |
| Documents | Coffre-fort de documents et suivi des recommandateurs | `src/lib/documents.*`, `src/lib/recommenders.*` |
| Coach IA | Analyse d'essai, revue de CV, simulateur d'entretien, questions-réponses (Claude) | `src/lib/ai/`, `docs/coach-ia.md` |
| Relances | Rappels d'expiration et de 2e tranche, envoyés dans la fenêtre 8 h – 20 h du membre | `src/lib/relance/` |
| Alertes bourses | Matching profil ↔ bourses publiées | `src/lib/matching.ts` |
| WhatsApp | Bot de commandes, notifications | `src/lib/whatsapp/`, `docs/whatsapp.md` |
| Parrainage | Liens de parrainage ; 30 jours offerts tous les 2 filleuls | `src/lib/referrals.*` |
| Admin | Membres, bourses, contenus, lauréats, diffusion, analytics | `src/lib/admin/`, `src/routes/_authenticated/admin.tsx` |
| Vie privée | Consentement, suppression de compte (exécutée après 7 jours, annulable) | `src/lib/privacy.*`, `src/lib/account-deletion.server.ts` |
| Hors ligne | PWA avec cache IndexedDB et file d'actions | `src/lib/offline/` |

## Stack

- **Framework** : [TanStack Start](https://tanstack.com/start) (React 19, routage par fichiers dans `src/routes/`, fonctions serveur `*.functions.ts`, code serveur seul `*.server.ts`), Vite.
- **UI** : Tailwind CSS 4, shadcn/ui (`src/components/ui/`).
- **Données** : Supabase (Postgres, Auth, RLS) via Lovable Cloud. Migrations SQL dans `drizzle/migrations/`.
- **Services** : Maketou (paiement), WhatsApp Cloud API, Africa's Talking (SMS), Resend (email), API Claude (coach), PostHog (facultatif).

## Structure

```
src/
  routes/              pages publiques, espace membre (_authenticated/), API (api/)
  lib/                 logique métier ; *.functions.ts = fonctions serveur, *.server.ts = serveur uniquement
  components/          composants par domaine + ui/ (shadcn)
  integrations/        clients Supabase et Lovable (générés, ne pas modifier)
drizzle/migrations/    migrations SQL numérotées
scripts/               génération des contenus (build-content.ts, build-knowledge.ts), données de démo
tests/                 tests unitaires (bun test)
docs/                  documentation d'exploitation
```

## Développement

Prérequis : [Bun](https://bun.sh).

```sh
bun install
bun run dev        # serveur de développement
bun run test       # tests unitaires
bun run lint       # ESLint + Prettier
npx tsc --noEmit   # vérification des types
bun run build      # build de production
```

Les variables d'environnement sont listées dans [`docs/mise-en-production.md`](docs/mise-en-production.md). Les clés Supabase sont fournies par Lovable Cloud.

## Lovable

Le projet est connecté à [Lovable](https://lovable.dev/projects/9408e301-b9c7-4b44-87a8-646b755317bc) : les commits poussés sur `main` sont synchronisés dans l'éditeur, et inversement. Ne pas réécrire l'historique publié (force-push, rebase, amend) — voir `AGENTS.md`.

## Documentation

- [`docs/mise-en-production.md`](docs/mise-en-production.md) : migrations, variables d'environnement, tâches planifiées, check-list de lancement
- [`docs/paiement-maketou.md`](docs/paiement-maketou.md) : parcours de paiement et codes d'accès
- [`docs/whatsapp.md`](docs/whatsapp.md) : connexion par code, bot, modèles Meta, SMS de secours
- [`docs/coach-ia.md`](docs/coach-ia.md) : coach IA, modèles, quotas
- [`docs/specification-v1.md`](docs/specification-v1.md) : spécification de lancement (historique)
