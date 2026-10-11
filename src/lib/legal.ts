/**
 * Textes des conditions d'utilisation et de la politique de données.
 * Version de travail à faire valider par KPB Education avant la mise en ligne.
 * Changer le contenu de façon substantielle implique d'incrémenter CONSENT_VERSION (privacy.ts).
 */
import { CONSENT_VERSION, DELETION_DELAY_DAYS } from "./privacy";

export const TERMS_MD = `## Objet

La plateforme KPB Education aide les étudiants à préparer leurs candidatures à des bourses d'études : vérification d'éligibilité, suivi des candidatures, guide, modèles, coffre-fort de documents, coach IA et accompagnement par un agent KPB.

## Compte

- Le compte est personnel. Il est ouvert avec un numéro WhatsApp, une adresse email ou un compte Google.
- Deux appareils au plus peuvent être connectés en même temps.
- Les contenus du Club (guide, modèles) portent un filigrane à votre nom : leur diffusion à des tiers est interdite.

## Club Boursier et accompagnement

- Le Club donne accès aux contenus et outils payants pendant la durée achetée (mensuelle ou trimestrielle), sans renouvellement automatique.
- Un code d'accès donne un nombre de jours défini au moment de sa création.
- L'accompagnement se règle en une ou deux tranches. Le dépôt final du dossier attend le règlement complet.
- Les paiements passent par Maketou (mobile money et carte). KPB Education ne conserve aucune donnée de carte.

## Coach IA

Les analyses du coach sont des suggestions. Elles ne garantissent pas l'obtention d'une bourse. Le coach n'écrit pas les essais à votre place.

## Responsabilité

KPB Education vérifie les informations publiées sur les bourses, sans pouvoir garantir les décisions des organismes qui les attribuent. Vérifiez toujours les dates et exigences sur le site officiel de la bourse.

## Contact

Équipe KPB Education sur WhatsApp : +33 7 68 67 42 92.

_Version ${CONSENT_VERSION}._
`;

export const PRIVACY_MD = `## Données collectées

- **Profil** : nom, téléphone, email, date de naissance, genre, nationalité, pays de résidence, études, niveau d'anglais, besoin de financement.
- **Candidatures** : bourses suivies, checklist, brouillons d'essais, recommandeurs (nom et email).
- **Documents** déposés dans le coffre-fort (bucket privé, liens de téléchargement valables 10 minutes).
- **Échanges** avec le coach IA et avec le bot WhatsApp.
- **Paiements** : montant, moyen, référence de transaction.
- **Utilisation** : pages et fonctions utilisées, pour améliorer le service.

## Pourquoi

Fournir le service, vous envoyer les rappels et alertes choisis, mesurer et améliorer la plateforme, tenir la comptabilité.

## Prestataires

- Supabase (hébergement de la base et des fichiers).
- Anthropic (coach IA) : les textes envoyés sont anonymisés ; vos pièces d'identité et documents ne sont jamais analysés par l'IA.
- Meta / WhatsApp (codes de connexion, notifications, bot) ; Africa's Talking (SMS de secours).
- Resend (emails), Maketou (paiements), PostHog (statistiques d'utilisation, si activé).

## Vos choix

- Les notifications WhatsApp et email se règlent dans **Compte → Préférences**.
- Vous pouvez modifier votre profil à tout moment.

## Suppression du compte

Depuis **Compte → Supprimer mon compte et mes documents**. Le compte, les documents, les essais et les échanges avec le coach sont effacés définitivement après ${DELETION_DELAY_DAYS} jours, délai pendant lequel vous pouvez annuler. Les paiements restent enregistrés, sans lien avec votre identité, pour les obligations comptables.

## Contact

Pour toute question sur vos données : équipe KPB Education sur WhatsApp, +33 7 68 67 42 92.

_Version ${CONSENT_VERSION}._
`;
