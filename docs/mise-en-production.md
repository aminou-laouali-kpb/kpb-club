# Mise en production — check-list

## 1. Migrations (dans l'ordre, éditeur SQL de Supabase)
Appliquer `drizzle/migrations/0004` à `0013`, dans l'ordre des numéros. 0000 à 0003 sont déjà en place.

- 0003 utilise `pg_cron` et `pg_net`, disponibles sur Supabase.
- 0010 et 0012 sont générées par `scripts/build-knowledge.ts` et `scripts/build-content.ts`. Elles remplissent la base de connaissances du coach, le guide et les modèles.
- La suite complète (0000 → 0013) a été appliquée sans erreur sur un PostgreSQL 16 de test.
- Après 0013 :
  - les bourses non publiées (`published = false`) disparaissent du site public ;
  - la base de connaissances n'est plus lisible depuis le navigateur ;
  - un événement `signup` est créé à chaque inscription.

## 2. Variables d'environnement
| Variable | Rôle |
|---|---|
| `APP_URL` | Adresse publique du site (liens des emails et WhatsApp) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase (déjà fournies par Lovable Cloud) |
| `MAKETOU_API_KEY`, `MAKETOU_WEBHOOK_SECRET` (+ `MAKETOU_BASE_URL`, `MAKETOU_CHECKOUT_PATH`, `MAKETOU_CART_PATH` si besoin) | Paiements — voir `docs/paiement-maketou.md` |
| `RESEND_API_KEY`, `KPB_EMAIL_FROM` | Emails |
| `KPB_SUPPORT_EMAIL` | Reçoit les demandes « agent » du bot |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` (+ `WHATSAPP_TEMPLATE_LANG`, noms de modèles facultatifs) | WhatsApp — voir `docs/whatsapp.md` |
| `OTP_HASH_SECRET` | Hachage des codes de connexion (chaîne aléatoire longue) |
| `SMS_API_KEY`, `SMS_USERNAME`, `SMS_SENDER_ID` | SMS de secours (Africa's Talking) |
| `ANTHROPIC_API_KEY` (+ `AI_MODEL_STRONG`, `AI_MODEL_FAST` facultatifs) | Coach IA — voir `docs/coach-ia.md` |
| `POSTHOG_KEY`, `POSTHOG_HOST` | Facultatif : copie des événements chez PostHog (UE par défaut) |

## 3. Tâches planifiées
Chaque appel porte l'en-tête `Authorization: Bearer <jeton cron>` (table `cron_tokens`, migration 0003).

| Route (POST) | Fréquence | Rôle |
|---|---|---|
| `/api/public/hooks/reminders` | chaque jour | Relances, rapprochement des paiements, événements « churned », suppression des comptes demandée depuis 7 jours |
| `/api/public/hooks/bourse-alerts` | chaque jour | Alertes de bourses compatibles |
| `/api/public/hooks/dispatch` | chaque heure | Envoi des messages en file (fenêtre 8 h – 20 h du membre) |

L'export `GET /api/admin/bourses.json` accepte le même jeton, ce qui permet de le récupérer automatiquement (n8n, scripts vidéo).

## 4. Meta (WhatsApp) — à déposer au plus tôt
Trois modèles, avec leur texte exact dans `docs/whatsapp.md` :
- `kpb_otp` (Authentification) ;
- `kpb_notification` (Utilitaire) ;
- `kpb_annonce` (Marketing).

Webhook : `{APP_URL}/api/public/hooks/whatsapp`.

## 5. Premier admin et démo
- Le premier admin est créé par la migration 0002 (rôle `admin` dans `user_roles`). Les agents sont des comptes admin, à qui l'on attribue des accompagnements dans l'onglet « Accompagnement ».
- Démo :
  1. Se connecter une fois avec le numéro choisi.
  2. Exécuter `scripts/seed-demo.sql`.
  3. Retirer la démo avec `scripts/clear-demo.sql`.
- Faire relire `src/lib/legal.ts` (conditions d'utilisation et politique de données). Pour tout changement important, incrémenter `CONSENT_VERSION` dans `src/lib/privacy.ts` : chaque membre reverra alors la demande d'accord.

## 6. Tests finaux (sur le site déployé)
- [ ] Connexion par code WhatsApp ; repli SMS si le message n'arrive pas ; connexion email et Google.
- [ ] Cases de consentement à l'inscription. Pour un compte existant, la fenêtre d'accord apparaît une fois.
- [ ] Paiement Maketou → retour sur le site → accès Club ouvert, reçu téléchargeable.
- [ ] Code d'accès de 16 caractères.
- [ ] Candidature : checklist, essai en autosauvegarde, dépôt d'un document (photo → PDF).
- [ ] Coach : analyse d'essai, revue de CV, entretien, questions.
- [ ] Bot WhatsApp : `statut`, `échéances`, envoi d'une photo.
- [ ] Mode hors ligne : guide et candidatures lisibles en mode avion.
- [ ] Admin :
  - [ ] modifier les dates d'une bourse → visibles dans le vérificateur ;
  - [ ] « Dupliquer pour l'année suivante » ;
  - [ ] export `bourses.json` ;
  - [ ] publier un post avec notification ;
  - [ ] diffusion à un segment (aperçu, puis envoi) ;
  - [ ] « Revu par KPB » visible côté membre.
- [ ] Tableau de bord admin renseigné (avec la démo).
- [ ] Suppression de compte : bandeau, annulation possible, effacement après 7 jours.
- [ ] Lighthouse mobile sur le site déployé (objectif ≥ 85).
- [ ] Aucune erreur CSP dans la console sur les pages principales, y compris dans l'éditeur Lovable.
