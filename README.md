# KPB Club

# Spécification technique — Plateforme Membre KPB Education (V1)

> **Destiné à** : développement assisté par IA (Cursor / Claude Code).
> **Date** : 17 septembre 2026
> **Auteur** : Aminou Laouali Abdou — KPB Education
> **Statut** : V1 — périmètre de lancement

---

## 0. Résumé exécutif

Plateforme unifiée servant deux offres commerciales — **Club Boursier** (abonnement) et **Accompagnement** (achat transactionnel) — sur une base utilisateur commune alimentée par le vérificateur d'éligibilité existant. La V1 couvre : authentification par téléphone, état d'abonnement, paiement mobile money, moteur de relance automatique, consultation filigranée du guide et des modèles.

---

## 1. Stack technique

| Couche | Choix | Justification |
|---|---|---|
| Framework | Next.js 15 App Router | SSR + API routes, déploiement Vercel |
| Langage | TypeScript strict | Sécurité type, compatibilité Cursor |
| CSS | Tailwind CSS 4 | Mobile-first, utility classes |
| BDD + Auth | Supabase (Postgres + Auth + Storage + Realtime) | Hébergement managé, RLS natif, Auth phone OTP intégré |
| Paiement | MoneyFusion API | Wave, Orange Money, MTN MoMo, Moov Money |
| Automatisation | n8n (self-hosted) | Relances, matching alertes, webhooks |
| Déploiement | Vercel | Edge, preview deployments |
| Notifications WhatsApp | API WhatsApp Business (via n8n) | Canal principal |
| Notifications email | Resend ou Brevo | Canal secondaire |

---

## 2. Architecture applicative

```
┌─────────────────────────────────────────────────┐
│                   NEXT.JS APP                    │
│                                                  │
│  /             → Landing + CTA vérificateur      │
│  /verificateur → Formulaire d'éligibilité        │
│  /login        → OTP phone                       │
│  /dashboard    → État abonnement + accès contenu │
│  /guide        → Consultation filigranée         │
│  /templates    → Modèles filigranés              │
│  /compte       → Profil, historique paiements    │
│                                                  │
│  /api/webhooks/moneyfusion → Callback paiement   │
│  /api/webhooks/whatsapp    → Incoming messages    │
│  /api/cron/relance         → Moteur de relance   │
│  /api/cron/matching        → Matching alertes     │
└───────────────────┬─────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │      SUPABASE         │
        │  Postgres + Auth      │
        │  Storage (guide PDF)  │
        │  RLS policies         │
        └───────────┬───────────┘
                    │
        ┌───────────┴───────────┐
        │        N8N            │
        │  Relance workflows    │
        │  WhatsApp sends       │
        │  Matching alertes     │
        │  MoneyFusion hooks    │
        └───────────────────────┘
```

### Décision : une seule application

Le vérificateur d'éligibilité et la plateforme membre sont **une seule application Next.js**. Raisons :

1. Le profil créé par le vérificateur EST le profil membre — pas de duplication.
2. Le tunnel de conversion est continu : vérificateur → résultat → CTA "Rejoindre le Club" → paiement → dashboard.
3. Un seul déploiement Vercel, un seul domaine, un seul Supabase.

Le vérificateur est la **page d'accueil publique** ; le dashboard est la zone authentifiée.

---

## 3. Modèle de données

### 3.1 Vue d'ensemble des relations

```
profiles 1──N subscriptions
profiles 1──N engagements
profiles 1──N payments
profiles 1──N alerts_log
subscriptions 1──N payments (via polymorphe)
engagements 1──N payments (via polymorphe)
bourses (table de référence, miroir de bourses.json)
```

### 3.2 Table `profiles`

Source : formulaire du vérificateur d'éligibilité. Devient un compte authentifié dès l'envoi de l'OTP.

```sql
CREATE TABLE profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT UNIQUE NOT NULL,        -- format E.164, ex: +22778098914
  email         TEXT,
  full_name     TEXT NOT NULL,
  date_of_birth DATE,
  gender        TEXT CHECK (gender IN ('M','F','other')),
  nationality   TEXT NOT NULL,               -- code ISO 3166-1 alpha-2
  residence     TEXT NOT NULL,               -- code ISO pays de résidence
  education     TEXT NOT NULL CHECK (education IN (
    'bac','licence','master','doctorat','autre'
  )),
  field_of_study TEXT,                       -- domaine d'études libre
  english_level TEXT CHECK (english_level IN (
    'none','basic','intermediate','advanced','native'
  )),
  financial_need BOOLEAN DEFAULT true,
  
  -- Crédit accompagnement (voir §9)
  credit_balance INTEGER DEFAULT 0,          -- en FCFA, plafonné à 15000

  -- Métadonnées
  whatsapp_optin BOOLEAN DEFAULT true,
  email_optin   BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  
  -- Supabase Auth link
  auth_user_id  UUID REFERENCES auth.users(id)
);

-- Index pour le matching alertes
CREATE INDEX idx_profiles_nationality ON profiles(nationality);
CREATE INDEX idx_profiles_education ON profiles(education);
CREATE INDEX idx_profiles_gender ON profiles(gender);
```

### 3.3 Table `subscriptions`

Un abonnement = une période. Jamais muté — on crée un nouveau record au renouvellement.

```sql
CREATE TYPE subscription_plan AS ENUM ('monthly', 'quarterly');
CREATE TYPE subscription_status AS ENUM ('active', 'grace', 'expired', 'cancelled');

CREATE TABLE subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id),
  plan          subscription_plan NOT NULL,
  amount        INTEGER NOT NULL,            -- FCFA
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  status        subscription_status DEFAULT 'active',
  
  -- Période de grâce : 3 jours après ends_at
  grace_ends_at TIMESTAMPTZ,
  
  -- Tracking relance
  reminder_j7_sent   BOOLEAN DEFAULT false,
  reminder_j2_sent   BOOLEAN DEFAULT false,
  reminder_j0_sent   BOOLEAN DEFAULT false,  -- jour d'expiration
  reminder_grace_sent BOOLEAN DEFAULT false, -- pendant la grâce
  
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_ends_at ON subscriptions(ends_at);
CREATE INDEX idx_subscriptions_profile ON subscriptions(profile_id);
```

### 3.4 Table `engagements`

Un accompagnement = une fenêtre universitaire achetée.

```sql
CREATE TYPE engagement_status AS ENUM (
  'pending_payment', 'active', 'documents_review',
  'submitted', 'completed', 'cancelled'
);

CREATE TABLE engagements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     UUID NOT NULL REFERENCES profiles(id),
  bourse_id      TEXT NOT NULL,              -- FK logique vers bourses.json / table bourses
  university     TEXT NOT NULL,
  window_year    INTEGER NOT NULL,           -- ex: 2027
  status         engagement_status DEFAULT 'pending_payment',
  amount         INTEGER NOT NULL,           -- FCFA (90000, ou portion du forfait)
  package_type   TEXT CHECK (package_type IN (
    'single', 'three_windows', 'all_windows', 'concierge'
  )),
  
  -- Suivi opérationnel (V2+, champs prêts)
  deadline       DATE,
  notes          TEXT,
  
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_engagements_profile ON engagements(profile_id);
CREATE INDEX idx_engagements_bourse ON engagements(bourse_id);
```

### 3.5 Table `payments`

Polymorphe : rattachable à une subscription OU à un engagement.

```sql
CREATE TYPE payment_status AS ENUM ('pending', 'success', 'failed', 'refunded');
CREATE TYPE payment_provider AS ENUM ('wave', 'orange_money', 'mtn_momo', 'moov_money', 'manual');
CREATE TYPE payable_type AS ENUM ('subscription', 'engagement');

CREATE TABLE payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       UUID NOT NULL REFERENCES profiles(id),
  payable_type     payable_type NOT NULL,
  payable_id       UUID NOT NULL,            -- FK vers subscriptions.id ou engagements.id
  amount           INTEGER NOT NULL,         -- FCFA
  provider         payment_provider NOT NULL,
  transaction_ref  TEXT,                     -- Référence MoneyFusion
  status           payment_status DEFAULT 'pending',
  paid_at          TIMESTAMPTZ,
  metadata         JSONB,                    -- Payload complet MoneyFusion
  
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payments_profile ON payments(profile_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_payable ON payments(payable_type, payable_id);
```

### 3.6 Table `bourses`

Miroir de `bourses.json`. Mise à jour mensuelle par script ou n8n.

```sql
CREATE TABLE bourses (
  id                TEXT PRIMARY KEY,         -- slug unique, ex: "sciences-po-paris"
  university_name   TEXT NOT NULL,
  country           TEXT NOT NULL,
  program_url       TEXT,
  
  -- Critères d'éligibilité (pour le matching)
  eligible_nationalities TEXT[],              -- codes ISO, vide = toutes
  gender_restriction TEXT CHECK (gender_restriction IN ('F','all')),
  min_education     TEXT,
  max_age           INTEGER,
  english_required  BOOLEAN DEFAULT false,
  financial_need_required BOOLEAN DEFAULT false,
  
  -- Fenêtre de candidature
  window_opens      DATE,
  window_closes     DATE,
  window_confirmed  BOOLEAN DEFAULT false,
  academic_year     INTEGER,                 -- ex: 2027
  
  -- Métadonnées
  notes             TEXT,
  updated_at        TIMESTAMPTZ DEFAULT now()
);
```

### 3.7 Table `alerts_log`

Historique des alertes envoyées pour éviter les doublons.

```sql
CREATE TABLE alerts_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id),
  bourse_id   TEXT NOT NULL REFERENCES bourses(id),
  channel     TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  sent_at     TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(profile_id, bourse_id, channel) -- une alerte par bourse par canal
);
```

### 3.8 Table `sessions`

Contrôle des sessions simultanées.

```sql
CREATE TABLE active_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id),
  device_info TEXT,
  ip_address  INET,
  last_active TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sessions_profile ON active_sessions(profile_id);
```

### 3.9 Row Level Security (RLS)

```sql
-- Chaque utilisateur ne voit que ses propres données
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own profile"
  ON profiles FOR ALL
  USING (auth_user_id = auth.uid());

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own subscriptions"
  ON subscriptions FOR SELECT
  USING (profile_id IN (
    SELECT id FROM profiles WHERE auth_user_id = auth.uid()
  ));

-- Idem pour engagements, payments, alerts_log
-- Les INSERT/UPDATE sur subscriptions et payments passent par les API routes (service role)
```

---

## 4. Authentification

### 4.1 Mécanisme : OTP par SMS via Supabase Auth

```
Utilisateur → Saisit numéro de téléphone (format local ou E.164)
Serveur     → Normalise en E.164
Supabase    → Envoie OTP par SMS (provider Twilio ou MessageBird)
Utilisateur → Saisit le code à 6 chiffres
Supabase    → Vérifie, crée auth.user, retourne JWT
App         → Lie auth.user.id à profiles.auth_user_id
```

### 4.2 Flux premier accès (depuis le vérificateur)

1. L'utilisateur remplit le formulaire d'éligibilité (pas d'auth requise).
2. Le résultat s'affiche. CTA : "Créer votre compte gratuit pour sauvegarder votre profil".
3. Saisie du numéro → OTP → compte créé.
4. Le profil est écrit dans `profiles` avec les données du formulaire.
5. CTA : "Rejoindre le Club Boursier — 30 000 FCFA / trimestre".

**Si le numéro existe déjà** : login classique, le profil existant est réutilisé. Le formulaire du vérificateur propose de mettre à jour les champs si les réponses diffèrent.

### 4.3 Flux connexion ultérieure

1. Saisie du numéro → OTP → JWT.
2. Redirection vers `/dashboard`.

### 4.4 Coût OTP

- Twilio SMS vers l'Afrique de l'Ouest : ~0.04–0.07 USD par SMS.
- Budget : 2 OTP/mois/utilisateur en moyenne (login + renouvellement) → ~0.10 USD/utilisateur/mois.
- À 1 000 membres : ~100 USD/mois. Acceptable sur un abonnement à 15 000 FCFA (~23 USD).

### 4.5 Connexion dégradée

- Le JWT est stocké côté client (cookie httpOnly, 30 jours d'expiration).
- Tant que le JWT est valide, pas besoin de nouvel OTP.
- Si expiration en zone sans réseau : page offline basique "Reconnectez-vous quand vous aurez du réseau", pas de contenu dégradé (le contenu est la valeur, il n'est pas distribué offline).

---

## 5. Paiement mobile money

### 5.1 Flux de paiement (MoneyFusion)

```
1. Utilisateur clique "Payer" sur /dashboard
2. Choix du provider (Wave / Orange Money / MTN MoMo / Moov Money)
3. POST /api/payments/initiate
   → Crée un payment (status: pending)
   → Appelle MoneyFusion API pour initier la transaction
   → Retourne l'URL de redirection ou le USSD prompt
4. L'utilisateur confirme sur son téléphone
5. MoneyFusion envoie le webhook → POST /api/webhooks/moneyfusion
6. Webhook handler :
   a. Vérifie la signature MoneyFusion
   b. Met à jour payment.status = 'success'
   c. Crée ou renouvelle la subscription / l'engagement
   d. Incrémente credit_balance si applicable (§9)
   e. Envoie confirmation WhatsApp + email
```

### 5.2 Grilles tarifaires

```typescript
const PRICING = {
  club: {
    quarterly: { amount: 30_000, duration_days: 90 },
    monthly:   { amount: 15_000, duration_days: 30 },
  },
  accompaniment: {
    single:        { amount: 90_000 },
    three_windows: { amount: 250_000 },
    all_windows:   { amount: 300_000 },
    concierge:     { amount: 690_000 },
  },
} as const;
```

### 5.3 Logique de renouvellement

Au paiement réussi d'un abonnement :

```typescript
async function renewSubscription(profileId: string, plan: 'monthly' | 'quarterly') {
  const current = await getActiveSubscription(profileId);
  const now = new Date();
  
  // Si abonnement actif ou en grâce, la nouvelle période commence à la fin de l'actuelle
  const startsAt = current && current.ends_at > now
    ? current.ends_at
    : now;
  
  const duration = plan === 'quarterly' ? 90 : 30;
  const endsAt = addDays(startsAt, duration);
  
  // Clôturer l'ancien si en grâce
  if (current?.status === 'grace') {
    await updateSubscription(current.id, { status: 'expired' });
  }
  
  return createSubscription({
    profile_id: profileId,
    plan,
    amount: PRICING.club[plan].amount,
    starts_at: startsAt,
    ends_at: endsAt,
    grace_ends_at: addDays(endsAt, 3),
    status: 'active',
  });
}
```

---

## 6. Moteur de relance

### 6.1 Règles

Le mobile money ne supporte pas le prélèvement automatique. Chaque renouvellement est un acte volontaire. Sans relance, le membre oublie et se retrouve expiré.

| Événement | Délai | Canal | Message |
|---|---|---|---|
| **Rappel J-7** | 7 jours avant `ends_at` | WhatsApp + email | "Votre abonnement expire dans 7 jours. Renouvelez maintenant pour ne pas perdre votre accès." + lien paiement |
| **Rappel J-2** | 2 jours avant `ends_at` | WhatsApp | "Plus que 2 jours ! Renouvelez en un clic." + lien paiement |
| **Jour d'expiration** | `ends_at` atteint | WhatsApp + email | "Votre abonnement a expiré. Vous avez 3 jours de grâce pour renouveler." + lien |
| **Période de grâce** | 3 jours après expiration | Accès maintenu, badge "Expire bientôt" | |
| **Coupure** | `grace_ends_at` atteint | WhatsApp + email | "Votre accès est suspendu. Renouvelez pour retrouver votre Club." + lien |
| **Relance post-expiration J+7** | 7 jours après coupure | WhatsApp | "On vous garde votre place. Reprenez là où vous en étiez." + lien |
| **Relance post-expiration J+30** | 30 jours après coupure | WhatsApp | Dernier message. Après : silence. |

### 6.2 Implémentation : CRON via n8n

```
n8n workflow "relance-engine"
  Trigger : toutes les heures (cron)
  
  Étape 1 : requête Supabase
    SELECT s.*, p.phone, p.email, p.full_name
    FROM subscriptions s
    JOIN profiles p ON p.id = s.profile_id
    WHERE s.status IN ('active', 'grace')
    AND (
      (s.ends_at - INTERVAL '7 days' <= now() AND NOT s.reminder_j7_sent)
      OR (s.ends_at - INTERVAL '2 days' <= now() AND NOT s.reminder_j2_sent)
      OR (s.ends_at <= now() AND NOT s.reminder_j0_sent)
      OR (s.grace_ends_at <= now() AND NOT s.reminder_grace_sent)
    )
  
  Étape 2 : pour chaque résultat, déterminer quel message envoyer
  
  Étape 3 : envoyer via WhatsApp Business API + email
  
  Étape 4 : marquer le flag correspondant à true dans subscriptions
```

### 6.3 Workflow n8n "subscription-status-updater"

```
Trigger : toutes les heures (cron)

-- Passer en grâce les abonnements expirés
UPDATE subscriptions
SET status = 'grace'
WHERE status = 'active' AND ends_at <= now();

-- Couper les grâces terminées
UPDATE subscriptions
SET status = 'expired'
WHERE status = 'grace' AND grace_ends_at <= now();
```

### 6.4 Templates WhatsApp

Les messages doivent être pré-approuvés par Meta. Templates à créer :

- `club_reminder_7d` — rappel 7 jours
- `club_reminder_2d` — rappel 2 jours
- `club_expired` — expiration avec grâce
- `club_suspended` — coupure
- `club_winback_7d` — relance J+7
- `club_winback_30d` — relance J+30
- `club_payment_confirmed` — confirmation de paiement
- `club_welcome` — bienvenue

Chaque template inclut un bouton "Renouveler" qui ouvre le lien de paiement.

---

## 7. Contenu filigrané

### 7.1 Principe

Le guide et les modèles ne sont **pas téléchargeables**. Ils sont affichés dans le navigateur avec un filigrane dynamique superposé.

### 7.2 Implémentation

**Option retenue : rendu HTML avec filigrane CSS.**

Le contenu du guide est stocké en Markdown dans Supabase Storage (ou directement en base). Il est rendu côté serveur en HTML avec un watermark CSS `::after` sur chaque page :

```css
.content-page::after {
  content: attr(data-watermark);
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-30deg);
  font-size: 3rem;
  color: rgba(0, 0, 0, 0.06);
  pointer-events: none;
  z-index: 1000;
  white-space: nowrap;
}
```

`data-watermark` = `"NOM COMPLET — KPB-XXXX"` où XXXX est un identifiant court du membre.

### 7.3 Mesures complémentaires

- **Pas de copier-coller** : `user-select: none` sur le conteneur de contenu.
- **Pas de clic droit** : `oncontextmenu="return false"` (défense minimale, cassable).
- **Pas de PDF téléchargeable** : le contenu ne quitte jamais le navigateur.

### 7.4 Limites acceptées

Comme acté dans le brief : ces mesures n'arrêtent ni la capture d'écran ni le partage. L'argument de vente est la **fraîcheur du contenu**, pas sa rareté. Un screenshot d'octobre est périmé en décembre.

### 7.5 Limite de sessions simultanées

Maximum **2 sessions actives** par profil.

```typescript
async function enforceSessionLimit(profileId: string, newSessionId: string) {
  const sessions = await getActiveSessions(profileId);
  
  if (sessions.length >= 2) {
    // Supprimer la session la plus ancienne
    const oldest = sessions.sort((a, b) => 
      a.last_active.getTime() - b.last_active.getTime()
    )[0];
    await deleteSession(oldest.id);
  }
  
  await createSession({ profile_id: profileId, id: newSessionId });
}
```

Une session est considérée inactive après **24h sans activité** et est nettoyée par un CRON quotidien.

---

## 8. Matching des alertes

### 8.1 Règle de matching

Un profil matche une bourse si **toutes** les conditions sont remplies :

```typescript
function profileMatchesBourse(profile: Profile, bourse: Bourse): boolean {
  // 1. Nationalité
  if (bourse.eligible_nationalities.length > 0 
      && !bourse.eligible_nationalities.includes(profile.nationality)) {
    return false;
  }
  
  // 2. Genre
  if (bourse.gender_restriction === 'F' && profile.gender !== 'F') {
    return false;
  }
  
  // 3. Niveau d'études minimum
  const educationOrder = ['bac', 'licence', 'master', 'doctorat'];
  if (bourse.min_education) {
    const profileLevel = educationOrder.indexOf(profile.education);
    const requiredLevel = educationOrder.indexOf(bourse.min_education);
    if (profileLevel < requiredLevel) return false;
  }
  
  // 4. Âge maximum
  if (bourse.max_age && getAge(profile.date_of_birth) > bourse.max_age) {
    return false;
  }
  
  // 5. Anglais requis
  if (bourse.english_required 
      && ['none', 'basic'].includes(profile.english_level)) {
    return false;
  }
  
  // 6. Besoin financier
  if (bourse.financial_need_required && !profile.financial_need) {
    return false;
  }
  
  // 7. Fenêtre ouverte ou ouvre dans les 60 prochains jours
  const now = new Date();
  const sixtyDaysFromNow = addDays(now, 60);
  if (!bourse.window_opens || bourse.window_opens > sixtyDaysFromNow) {
    return false;
  }
  if (bourse.window_closes && bourse.window_closes < now) {
    return false;
  }
  
  return true;
}
```

### 8.2 Fréquence

- **Job quotidien** via n8n (6h UTC = 7h Niamey).
- Requête tous les profils avec un abonnement actif.
- Pour chaque profil, teste toutes les bourses avec `window_confirmed = true`.
- Si match ET pas déjà dans `alerts_log` → envoie WhatsApp + email, insère dans `alerts_log`.

### 8.3 Format du message d'alerte

```
🎓 Alerte bourse — {university_name}

{full_name}, une fenêtre correspondant à votre profil vient de s'ouvrir :

📍 {university_name} ({country})
📅 Date limite : {window_closes}
✅ Vous remplissez les critères d'éligibilité

→ Consultez les détails sur votre espace membre : {link}

💡 Besoin d'un accompagnement pour cette candidature ?
   Offre accompagnement à partir de 90 000 FCFA : {link_accompagnement}
```

---

## 9. Crédit accompagnement

### 9.1 Décision : retenu, version simple

Chaque mois d'abonnement actif crédite **5 000 FCFA** déductibles d'un accompagnement, plafonné à **15 000 FCFA** (= 3 mois = 1 trimestre).

### 9.2 Règles

- Crédité à chaque paiement de subscription réussi : +5 000 par mois payé (trimestriel = +15 000 d'un coup).
- Plafonné à 15 000 FCFA. Au-delà, les paiements ne créditent plus.
- Déduit automatiquement à la création d'un engagement.
- **Non remboursable**, non transférable, non convertible en cash.
- Reset à 0 si l'abonnement expire (après la période de grâce). Raison : c'est une incitation à rester, pas une cagnotte.

### 9.3 Implémentation

```typescript
async function creditOnPayment(profileId: string, plan: 'monthly' | 'quarterly') {
  const profile = await getProfile(profileId);
  const creditToAdd = plan === 'quarterly' ? 15_000 : 5_000;
  const newBalance = Math.min(profile.credit_balance + creditToAdd, 15_000);
  
  await updateProfile(profileId, { credit_balance: newBalance });
}

async function applyCredit(profileId: string, engagementAmount: number) {
  const profile = await getProfile(profileId);
  const discount = Math.min(profile.credit_balance, engagementAmount);
  const finalAmount = engagementAmount - discount;
  
  await updateProfile(profileId, { credit_balance: profile.credit_balance - discount });
  
  return { finalAmount, discount };
}

// À l'expiration (dans le status-updater)
async function resetCreditOnExpiration(profileId: string) {
  await updateProfile(profileId, { credit_balance: 0 });
}
```

---

## 10. Pages et composants — V1

### 10.1 Pages publiques

| Route | Fonction | Composants |
|---|---|---|
| `/` | Landing page | Hero, arguments Club, pricing, CTA vérificateur |
| `/verificateur` | Formulaire d'éligibilité | Stepper multi-étapes, résultat avec universités matchées |
| `/login` | Authentification OTP | Input téléphone, input code, gestion erreurs |

### 10.2 Pages authentifiées (middleware auth)

| Route | Fonction | Composants |
|---|---|---|
| `/dashboard` | Vue d'ensemble | Carte abonnement (statut, date expiration, jours restants), CTA renouveler si proche, crédit accompagnement, bourses matchées, accès rapide guide/modèles |
| `/guide` | Consultation du guide | Sommaire, chapitres, navigation, filigrane |
| `/guide/[chapter]` | Chapitre individuel | Contenu Markdown rendu, filigrane |
| `/templates` | Liste des modèles | Cards par type (CV, lettre de motivation, essai, recommandation) |
| `/templates/[slug]` | Consultation modèle | Contenu filigrané, non téléchargeable |
| `/compte` | Profil et paramètres | Édition profil, historique paiements, gestion abonnement |
| `/paiement` | Flux de paiement | Choix offre, choix provider, redirection MoneyFusion |

### 10.3 Composants partagés

```
components/
  layout/
    MobileNav.tsx          -- Navigation bottom-bar mobile-first
    Header.tsx
    Footer.tsx
  auth/
    PhoneInput.tsx         -- Input téléphone avec indicatif pays
    OtpInput.tsx           -- 6 digits, auto-focus, auto-submit
  subscription/
    SubscriptionCard.tsx   -- État abonnement avec badge statut
    RenewalCTA.tsx         -- Bouton contextuel selon état
    CreditBadge.tsx        -- Affichage crédit accompagnement
    PricingTable.tsx       -- Grille tarifaire
  content/
    WatermarkedContent.tsx -- Wrapper avec filigrane dynamique
    ChapterNav.tsx         -- Navigation guide
    TemplateCard.tsx
  payment/
    ProviderSelector.tsx   -- Choix Wave/Orange/MTN/Moov
    PaymentStatus.tsx      -- Polling statut paiement
  alerts/
    BourseMatchCard.tsx    -- Bourse compatible avec le profil
    AlertsList.tsx
  shared/
    LoadingSpinner.tsx
    ErrorBoundary.tsx
    OfflineBanner.tsx      -- Détection offline, message
```

---

## 11. API Routes — V1

```
app/api/
  auth/
    verify-otp/route.ts         -- POST: vérifie OTP, lie au profil
  
  profiles/
    route.ts                     -- GET: profil courant, PUT: mise à jour
  
  subscriptions/
    route.ts                     -- GET: abonnement actif
    
  payments/
    initiate/route.ts            -- POST: initie paiement MoneyFusion
    status/[id]/route.ts         -- GET: statut d'un paiement
  
  webhooks/
    moneyfusion/route.ts         -- POST: callback MoneyFusion (non auth)
  
  eligibility/
    check/route.ts               -- POST: calcul éligibilité (public)
  
  content/
    guide/[chapter]/route.ts     -- GET: contenu chapitre (auth + abo actif)
    templates/[slug]/route.ts    -- GET: contenu modèle (auth + abo actif)
  
  alerts/
    route.ts                     -- GET: alertes du profil
```

### 11.1 Middleware d'accès au contenu

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const protectedPaths = ['/dashboard', '/guide', '/templates', '/compte'];
  
  if (protectedPaths.some(p => request.nextUrl.pathname.startsWith(p))) {
    // Vérifier JWT Supabase
    const session = getSession(request);
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
}

// Pour le contenu (guide, templates) : vérifier abonnement actif
async function requireActiveSubscription(profileId: string) {
  const sub = await getActiveOrGraceSubscription(profileId);
  if (!sub) {
    throw new ForbiddenError('Abonnement requis');
    // Côté client : redirect vers /paiement avec message
  }
}
```

---

## 12. Sécurité et performance

### 12.1 Sécurité

- **RLS Supabase** sur toutes les tables contenant des données utilisateur.
- **Signature webhook MoneyFusion** vérifiée sur chaque callback.
- **Rate limiting** sur `/api/auth/verify-otp` : 5 tentatives par numéro par heure.
- **JWT httpOnly cookie**, SameSite=Strict, Secure.
- **CORS** restreint au domaine de production.
- **Input validation** via Zod sur toutes les routes API.

### 12.2 Performance mobile

- **Mobile-first** : tout le design part du viewport 375px.
- **Pas de JS lourd** : le contenu du guide est du Markdown rendu en HTML SSR. Pas de framework de rendu PDF.
- **Images optimisées** via `next/image` avec WebP.
- **Service Worker** minimal : cache les assets statiques (CSS, JS, icônes), pas le contenu.
- **Skeleton loaders** sur le dashboard et le guide pendant le chargement.

---

## 13. Structure du projet

```
kpb-platform/
├── app/
│   ├── (public)/                  -- Routes publiques
│   │   ├── page.tsx               -- Landing
│   │   ├── verificateur/
│   │   │   └── page.tsx
│   │   └── login/
│   │       └── page.tsx
│   ├── (authenticated)/           -- Routes protégées (layout avec auth check)
│   │   ├── layout.tsx             -- Auth middleware + nav
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── guide/
│   │   │   ├── page.tsx           -- Sommaire
│   │   │   └── [chapter]/
│   │   │       └── page.tsx
│   │   ├── templates/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/
│   │   │       └── page.tsx
│   │   ├── compte/
│   │   │   └── page.tsx
│   │   └── paiement/
│   │       └── page.tsx
│   ├── api/                       -- API routes (voir §11)
│   ├── layout.tsx                 -- Root layout
│   └── globals.css
├── components/                    -- Voir §10.3
├── lib/
│   ├── supabase/
│   │   ├── client.ts              -- Client browser
│   │   ├── server.ts              -- Client server-side
│   │   └── admin.ts               -- Client service role (webhooks, crons)
│   ├── moneyfusion/
│   │   ├── client.ts              -- API MoneyFusion
│   │   └── webhook.ts             -- Vérification signature
│   ├── matching/
│   │   └── engine.ts              -- Algorithme de matching profil/bourse
│   ├── relance/
│   │   └── engine.ts              -- Logique de relance
│   ├── content/
│   │   └── renderer.ts            -- Markdown → HTML avec filigrane
│   ├── auth/
│   │   └── session.ts             -- Gestion sessions, limite 2
│   ├── pricing.ts                 -- Constantes tarifaires
│   └── utils.ts
├── content/
│   ├── guide/                     -- Chapitres en Markdown
│   │   ├── 01-introduction.md
│   │   ├── 02-choisir-sa-bourse.md
│   │   └── ...
│   └── templates/                 -- Modèles en Markdown
│       ├── cv-academique.md
│       ├── lettre-motivation.md
│       ├── essai-personnel.md
│       └── lettre-recommandation.md
├── data/
│   └── bourses.json               -- Source de vérité bourses
├── supabase/
│   └── migrations/
│       ├── 001_create_profiles.sql
│       ├── 002_create_subscriptions.sql
│       ├── 003_create_engagements.sql
│       ├── 004_create_payments.sql
│       ├── 005_create_bourses.sql
│       ├── 006_create_alerts_log.sql
│       ├── 007_create_sessions.sql
│       └── 008_rls_policies.sql
├── n8n/
│   ├── relance-engine.json        -- Workflow relance exporté
│   ├── subscription-status-updater.json
│   ├── matching-alertes.json
│   └── session-cleanup.json
├── .env.local
├── .env.example
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 14. Variables d'environnement

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# MoneyFusion
MONEYFUSION_API_KEY=
MONEYFUSION_SECRET_KEY=
MONEYFUSION_WEBHOOK_SECRET=
MONEYFUSION_BASE_URL=

# WhatsApp Business API
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=

# Email (Resend ou Brevo)
RESEND_API_KEY=

# n8n
N8N_WEBHOOK_BASE_URL=

# App
NEXT_PUBLIC_APP_URL=
CRON_SECRET=                       -- Sécurise les endpoints cron
```

---

## 15. Critères d'acceptation — V1

### CA-01 : Inscription via le vérificateur
- [ ] Un utilisateur peut remplir le formulaire d'éligibilité sans compte
- [ ] Le résultat affiche les universités compatibles
- [ ] Le CTA "Créer un compte" déclenche l'OTP
- [ ] Le profil est créé avec les données du formulaire
- [ ] Un numéro existant déclenche un login, pas une erreur

### CA-02 : Authentification OTP
- [ ] L'OTP est envoyé par SMS en moins de 30 secondes
- [ ] Le code est à 6 chiffres, expire en 10 minutes
- [ ] 5 tentatives max par numéro par heure
- [ ] Après auth, le JWT est stocké en cookie httpOnly (30j)
- [ ] La reconnexion ultérieure ne redemande pas l'OTP tant que le cookie est valide

### CA-03 : Dashboard
- [ ] Affiche l'état de l'abonnement (actif / grâce / expiré / aucun)
- [ ] Affiche le nombre de jours restants
- [ ] Affiche le crédit accompagnement
- [ ] Affiche les bourses matchées (si abonnement actif)
- [ ] CTA de paiement/renouvellement contextuel

### CA-04 : Paiement mobile money
- [ ] Choix entre Wave, Orange Money, MTN MoMo, Moov Money
- [ ] Le paiement initié redirige vers le provider
- [ ] Le webhook MoneyFusion met à jour le statut en temps réel
- [ ] Une confirmation WhatsApp + email est envoyée au succès
- [ ] La subscription est créée/renouvelée correctement (pas de chevauchement)
- [ ] En cas d'échec, le paiement est marqué `failed` et l'utilisateur peut réessayer

### CA-05 : Consultation du guide
- [ ] Le sommaire liste tous les chapitres
- [ ] Chaque chapitre s'affiche avec le filigrane "NOM — KPB-XXXX"
- [ ] Le texte n'est pas sélectionnable (user-select: none)
- [ ] Il n'y a aucun lien de téléchargement
- [ ] Accès refusé (redirect /paiement) si pas d'abonnement actif ou en grâce

### CA-06 : Consultation des modèles
- [ ] Mêmes règles que le guide (filigrane, pas de téléchargement, auth + abo requis)
- [ ] Chaque modèle a sa page propre

### CA-07 : Moteur de relance
- [ ] J-7 : WhatsApp + email envoyés, flag `reminder_j7_sent` = true
- [ ] J-2 : WhatsApp envoyé, flag `reminder_j2_sent` = true
- [ ] J0 : WhatsApp + email envoyés, passage en `grace`
- [ ] J+3 : coupure, passage en `expired`, reset crédit
- [ ] J+7 : relance WhatsApp
- [ ] J+30 : dernière relance WhatsApp, puis silence
- [ ] Aucun doublon (les flags empêchent le renvoi)

### CA-08 : Limite de sessions
- [ ] Max 2 sessions actives par profil
- [ ] La 3e connexion éjecte la session la plus ancienne
- [ ] Les sessions inactives >24h sont nettoyées

### CA-09 : Matching alertes
- [ ] Le job quotidien identifie les correspondances profil/bourse
- [ ] Une alerte n'est envoyée qu'une seule fois par bourse par canal
- [ ] Le message WhatsApp contient le nom de l'université, la date limite et un CTA accompagnement
- [ ] Seuls les profils avec abonnement actif reçoivent les alertes

### CA-10 : Mobile-first
- [ ] Toutes les pages sont lisibles et fonctionnelles sur un écran 375px
- [ ] Le temps de chargement initial est < 3 secondes sur 3G
- [ ] La navigation est tactile (bottom-bar, pas de hover-only)

---

## 16. Séquence de développement recommandée pour Cursor

### Sprint 1 — Fondations (3-4 jours)
1. `npx create-next-app@latest kpb-platform --typescript --tailwind --app`
2. Configurer Supabase : créer le projet, exécuter les migrations SQL (§3)
3. Configurer l'auth Supabase Phone (Twilio)
4. Implémenter le flow auth : `/login` → OTP → JWT → redirect
5. Layout authentifié avec middleware
6. Page `/dashboard` avec composant `SubscriptionCard` (données mockées)

### Sprint 2 — Profils et vérificateur (2-3 jours)
7. Formulaire d'éligibilité multi-étapes (`/verificateur`)
8. Algorithme de matching profil/bourses (lib/matching/engine.ts)
9. Page de résultat avec universités compatibles
10. Liaison vérificateur → création de compte → profil

### Sprint 3 — Paiement (3-4 jours)
11. Intégration MoneyFusion : client API + initiation paiement
12. Webhook handler avec vérification de signature
13. Logique `renewSubscription` + création engagement
14. Page `/paiement` avec `ProviderSelector`
15. Polling statut paiement côté client
16. Confirmation WhatsApp + email (via n8n ou direct)

### Sprint 4 — Contenu (2-3 jours)
17. Écrire les chapitres du guide en Markdown (`content/guide/`)
18. Renderer Markdown → HTML avec filigrane dynamique
19. Pages `/guide` et `/guide/[chapter]`
20. Pages `/templates` et `/templates/[slug]`
21. Middleware de vérification d'abonnement actif

### Sprint 5 — Moteur de relance et alertes (2-3 jours)
22. Workflows n8n : relance-engine, subscription-status-updater
23. Templates WhatsApp Business (soumission à Meta)
24. Workflow n8n : matching-alertes quotidien
25. Table alerts_log + déduplication
26. Page compte avec historique paiements

### Sprint 6 — Polish et launch (2-3 jours)
27. Landing page `/`
28. Gestion sessions simultanées
29. Gestion offline (banner, comportement gracieux)
30. Crédit accompagnement (logique + affichage)
31. Tests manuels sur mobile (Android + iOS Safari)
32. Déploiement Vercel + domaine custom

**Total estimé : 15-20 jours de développement assisté par Cursor.**

---

## 17. Hors périmètre V1 (backlog V2/V3)

| Feature | Version | Notes |
|---|---|---|
| Bibliothèque de contenus avec notifications | V2 | Nouvelle bourse, vidéo, méthode |
| IA critique d'essai | V3 | Plafonné à 5/mois, note contre critères réels |
| Admin panel | V2 | Gestion membres, bourses, contenus |
| Segmentation communauté WhatsApp par fenêtre | V2 | Groupes automatiques |
| Atelier mensuel avec inscription | V2 | Calendrier + rappel |
| Analytics (cohortes, rétention, MRR) | V2 | Dashboard admin |
| Multi-langue (anglais) | V3 | Pour l'expansion anglophone |

---

## 18. Décisions d'architecture — résumé

| Question du brief | Décision | Justification |
|---|---|---|
| Un modèle ou deux tables ? | Tables séparées `subscriptions` + `engagements` | Nature différente (temporel vs transactionnel), multiplicité différente, requêtes distinctes |
| Cadence de relance | J-7, J-2, J0, grâce 3j, J+7, J+30 | Assez fréquent pour ne pas perdre le membre, pas assez pour spammer |
| Coupure immédiate ou grâce ? | 3 jours de grâce | Le mobile money n'est pas instantané, les délais réseau existent |
| Vérificateur : deux apps ou une ? | Une seule app Next.js | Le profil est le même, le tunnel est continu, un seul déploiement |
| Quand le profil devient un compte ? | À la première demande d'OTP, après le vérificateur | Le vérificateur est gratuit et anonyme, l'OTP est le premier engagement |
| Matching : quelles règles ? | 7 critères AND (nationalité, genre, études, âge, anglais, besoin financier, fenêtre ouverte ≤60j) | Exhaustif sans faux positif, alerte utile uniquement si le membre peut agir |
| Auth téléphone : mécanisme ? | Supabase Auth Phone OTP (Twilio) | Intégré, pas de code custom, coût acceptable |
| Filigrane : implémentation ? | CSS overlay + user-select:none | Léger, pas de librairie, suffisant compte tenu de la philosophie "contenu frais > anti-copie" |
| Sessions simultanées ? | Max 2, éjection de la plus ancienne | Tolérant (mobile + desktop), empêche le partage de masse |
| Crédit accompagnement ? | Retenu, 5 000/mois, plafond 15 000, reset à l'expiration | Transforme la pression de résiliation en chemin vers l'accompagnement |

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9408e301-b9c7-4b44-87a8-646b755317bc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
