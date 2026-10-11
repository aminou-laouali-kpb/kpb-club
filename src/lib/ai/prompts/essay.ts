import { AUDIENCE, NEVER_WRITE } from "./shared";

export const ESSAY_SYSTEM = `Tu es l'évaluateur d'essais de KPB Education.

${AUDIENCE}

${NEVER_WRITE} Si l'étudiant te demande d'écrire ou de réécrire, remplis le champ \`refusal\` avec une phrase qui le redirige vers les modèles de la plateforme et l'accompagnement KPB, et laisse les autres champs à leur valeur minimale.

Comment évaluer :
- Note chaque critère fourni dans <criteria> sur 10, avec une justification qui renvoie au texte. La note globale sur 100 reflète la pondération des critères.
- Pour chaque force et chaque manque, cite le passage concerné mot pour mot, entre guillemets dans le champ prévu. Si un manque est une absence (rien n'en parle), cite le passage le plus proche de l'endroit où ce contenu devrait se trouver.
- Les manques décrivent ce qui fait défaut et pourquoi un comité le remarquerait. Ne propose pas de formulation de remplacement.
- Les questions à se poser aident l'étudiant à trouver lui-même la matière qui manque (exemples vécus, chiffres, résultats).
- Signale les passages génériques : formules creuses, affirmations sans preuve, tournures qui ressemblent à un texte généré.
- Vérifie la longueur par rapport à la limite indiquée et la langue attendue.

Réponds en français, même si l'essai est en anglais.`;

export function essayCriteriaBlock(
  bourseName: string | null,
  criteria: { name: string; description: string; weight?: number }[],
) {
  const list = criteria
    .map((c) => `- ${c.name}${c.weight ? ` (${c.weight} %)` : ""} : ${c.description}`)
    .join("\n");
  return `<criteria bourse="${bourseName ?? "générique"}">\n${list}\n</criteria>`;
}

/** Critères génériques quand la bourse n'a pas sa propre grille. */
export const DEFAULT_ESSAY_CRITERIA = [
  {
    name: "Clarté du projet",
    description: "Programme visé, objectifs, débouchés précis.",
    weight: 25,
  },
  {
    name: "Motivation pour ce programme",
    description: "Pourquoi cette bourse et cette université, avec des éléments concrets.",
    weight: 20,
  },
  {
    name: "Impact",
    description: "Retour attendu pour la communauté, démontré par des actions passées.",
    weight: 25,
  },
  {
    name: "Preuves et exemples",
    description: "Faits, chiffres et réalisations vérifiables.",
    weight: 20,
  },
  {
    name: "Qualité de l'écriture",
    description: "Structure, fluidité, correction, voix personnelle.",
    weight: 10,
  },
];

export function essayUserMessage(input: {
  prompt: string | null;
  maxWords: number | null;
  language: string;
  profileSummary: string;
  essay: string;
}) {
  return `<essay_prompt>${input.prompt ?? "Sujet libre (essai de motivation)"}</essay_prompt>
<constraints>Longueur maximale : ${input.maxWords ?? "non précisée"} mots. Langue attendue : ${input.language === "en" ? "anglais" : "français"}.</constraints>
<profile>${input.profileSummary}</profile>
<essay>
${input.essay}
</essay>`;
}
