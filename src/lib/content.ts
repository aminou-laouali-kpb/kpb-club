/**
 * Contenu du guide et des modèles.
 * Texte provisoire — à remplacer par les contenus réels de KPB Education.
 */

export type ContentItem = {
  slug: string;
  title: string;
  summary: string;
  body: string;
};

const PLACEHOLDER = "_Contenu provisoire — à remplacer par le texte définitif._";

export const GUIDE_CHAPTERS: ContentItem[] = [
  {
    slug: "01-introduction",
    title: "Introduction : comprendre le paysage des bourses",
    summary: "Ce que finance réellement une bourse, et comment lire une offre.",
    body: `${PLACEHOLDER}

## Ce que couvre une bourse

Une bourse complète couvre généralement les frais de scolarité, un montant de subsistance
mensuel, le billet d'avion et l'assurance santé. Une bourse partielle ne couvre qu'une partie
de ces postes.

## Lire une offre correctement

- Vérifiez la date limite réelle, pas la date d'annonce.
- Vérifiez les nationalités éligibles.
- Vérifiez le niveau d'études exigé à la date de candidature.

## À retenir

La bourse n'est pas une loterie : c'est un dossier qui répond précisément à des critères.`,
  },
  {
    slug: "02-choisir-sa-bourse",
    title: "Choisir la bonne fenêtre de candidature",
    summary: "Cibler trois à cinq programmes réellement atteignables.",
    body: `${PLACEHOLDER}

## Construire une liste courte

Trois programmes ambitieux, trois réalistes, deux de sécurité.

## Le calendrier

Comptez huit semaines entre le début du dossier et l'envoi.`,
  },
  {
    slug: "03-constituer-le-dossier",
    title: "Constituer le dossier",
    summary: "Pièces exigées, traductions, légalisations, délais.",
    body: `${PLACEHOLDER}

## Les pièces habituelles

1. Relevés de notes et diplômes
2. Lettre de motivation
3. CV académique
4. Deux lettres de recommandation
5. Preuve de niveau de langue`,
  },
  {
    slug: "04-lettre-de-motivation",
    title: "Écrire une lettre de motivation qui tient",
    summary: "Structure en quatre temps et erreurs fréquentes.",
    body: `${PLACEHOLDER}

## Structure

1. Pourquoi ce domaine
2. Pourquoi ce programme
3. Ce que vous apportez
4. Ce que vous ferez ensuite`,
  },
  {
    slug: "05-entretien",
    title: "Préparer l'entretien",
    summary: "Les dix questions qui reviennent presque toujours.",
    body: `${PLACEHOLDER}

## Les questions récurrentes

- Parlez-nous de votre parcours.
- Pourquoi notre université ?
- Que ferez-vous après vos études ?`,
  },
];

export const TEMPLATES: ContentItem[] = [
  {
    slug: "cv-academique",
    title: "CV académique",
    summary: "Format une page, orienté recherche et résultats.",
    body: `${PLACEHOLDER}

## Structure du CV

**Nom Prénom** — ville, pays — email — téléphone

### Formation
Année — Diplôme — Établissement — Mention

### Expériences
Année — Poste — Organisation — Résultat mesurable

### Compétences et langues`,
  },
  {
    slug: "lettre-motivation",
    title: "Lettre de motivation",
    summary: "Modèle en quatre paragraphes, adaptable à tout programme.",
    body: `${PLACEHOLDER}

Madame, Monsieur,

Paragraphe 1 — l'intention.

Paragraphe 2 — le parcours.

Paragraphe 3 — l'adéquation avec le programme.

Paragraphe 4 — le projet après le diplôme.`,
  },
  {
    slug: "essai-personnel",
    title: "Essai personnel",
    summary: "Récit structuré autour d'un obstacle et d'un apprentissage.",
    body: `${PLACEHOLDER}

## Plan conseillé

1. Une scène concrète
2. Ce qu'elle a changé
3. Le lien avec vos études
4. Ce que vous visez`,
  },
  {
    slug: "lettre-recommandation",
    title: "Lettre de recommandation",
    summary: "Trame à remettre à votre référent pour lui faciliter la tâche.",
    body: `${PLACEHOLDER}

## Trame pour le référent

- Depuis quand et dans quel cadre il vous connaît
- Deux qualités illustrées par des faits
- Une comparaison avec d'autres étudiants
- Une recommandation explicite`,
  },
];

export function findGuideChapter(slug: string) {
  return GUIDE_CHAPTERS.find((c) => c.slug === slug);
}

export function findTemplate(slug: string) {
  return TEMPLATES.find((t) => t.slug === slug);
}
