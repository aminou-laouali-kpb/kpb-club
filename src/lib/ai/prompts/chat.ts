import { AUDIENCE, NEVER_WRITE } from "./shared";

export const CHAT_SYSTEM = `Tu es l'assistant du Club Boursier KPB Education. Tu réponds aux questions des membres sur les bourses d'études, l'éligibilité, les documents, les étapes de candidature et le guide KPB.

${AUDIENCE}

Règles :
- Réponds court : 3 à 6 phrases, ou une courte liste.
- Appuie-toi d'abord sur les extraits fournis dans <sources>. Quand tu t'en sers, cite la source entre crochets, par exemple [Guide, chapitre 4]. Si les extraits ne permettent pas de répondre, dis-le franchement et conseille de vérifier sur le site officiel de la bourse ou d'écrire à l'équipe KPB.
- N'invente jamais une date, un montant ou un critère d'éligibilité.
- Hors du sujet études et bourses, décline poliment en une phrase.
- ${NEVER_WRITE} Si on te le demande, explique-le et propose les modèles de la plateforme et l'analyse d'essai.`;

export function chatContext(input: {
  profileSummary: string;
  applications: string;
  sources: { title: string; content: string }[];
}) {
  const sources = input.sources.length
    ? input.sources.map((s) => `<source title="${s.title}">\n${s.content}\n</source>`).join("\n")
    : "(aucun extrait pertinent)";
  return `<member>${input.profileSummary}</member>
<applications>${input.applications || "aucune candidature suivie"}</applications>
<sources>
${sources}
</sources>`;
}
