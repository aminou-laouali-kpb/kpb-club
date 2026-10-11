/** Commandes du bot WhatsApp et mise en forme des réponses (texte simple, ≤ 1 024 caractères). */
import { formatDateFr } from "../matching";

export type Command =
  "status" | "deadlines" | "bourses" | "actions" | "help" | "agent" | "question";

export const WA_MAX_LENGTH = 1024;

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMMANDS: [Command, string[]][] = [
  ["status", ["statut", "mon statut", "status", "abonnement", "mon abonnement"]],
  [
    "deadlines",
    ["echeances", "echeance", "mes echeances", "deadlines", "deadline", "dates", "dates limites"],
  ],
  ["bourses", ["bourses", "bourse", "mes bourses", "bourses ouvertes"]],
  ["actions", ["action", "actions", "quoi faire", "que faire", "prochaine action"]],
  ["help", ["aide", "menu", "help", "bonjour", "salut", "hello", "start", "commencer"]],
  ["agent", ["agent", "humain", "conseiller", "parler a un humain", "parler a un agent"]],
];

export function parseCommand(text: string): Command {
  const t = normalize(text);
  for (const [command, words] of COMMANDS) if (words.includes(t)) return command;
  return "question";
}

export function clip(text: string, max = WA_MAX_LENGTH) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export const MENU_ROWS: { id: string; title: string; description: string }[] = [
  { id: "statut", title: "Mon statut", description: "Abonnement et jours restants" },
  { id: "echeances", title: "Mes échéances", description: "Les 5 prochaines dates" },
  { id: "action", title: "Quoi faire", description: "Ta prochaine action par candidature" },
  { id: "bourses", title: "Bourses ouvertes", description: "Celles qui te correspondent" },
  { id: "agent", title: "Parler à l'équipe", description: "Un conseiller KPB te répond" },
];

export function formatMenu() {
  return clip(
    `Je peux t'aider avec :\n${MENU_ROWS.map((r) => `• *${r.id}* — ${r.description}`).join("\n")}\n\nTu peux aussi m'envoyer une photo ou un PDF : je le range dans ton coffre-fort. Ou pose-moi directement ta question.`,
  );
}

export function formatStatus(input: {
  name: string;
  state: "active" | "grace" | "none";
  daysLeft: number;
  endsAt: string | null;
  link: string;
}) {
  const hello = `Bonjour ${input.name || ""} 👋`.trim();
  if (input.state === "active") {
    return clip(
      `${hello}\nTon abonnement Club Boursier est actif jusqu'au ${formatDateFr(input.endsAt)} (${input.daysLeft} jour${input.daysLeft > 1 ? "s" : ""}).\nRenouveler : ${input.link}`,
    );
  }
  if (input.state === "grace") {
    return clip(
      `${hello}\nTon abonnement est expiré : il te reste ${input.daysLeft} jour${input.daysLeft > 1 ? "s" : ""} de grâce.\nRenouveler : ${input.link}`,
    );
  }
  return clip(`${hello}\nTu n'as pas d'abonnement Club actif.\nRejoindre le Club : ${input.link}`);
}

export function formatDeadlines(
  items: { label: string; bourse: string; dueDate: string | null }[],
  link: string,
) {
  if (items.length === 0)
    return clip(`Aucune échéance à venir. Ajoute une bourse pour obtenir ta checklist : ${link}`);
  const lines = items
    .slice(0, 5)
    .map((i) => `• ${formatDateFr(i.dueDate)} — ${i.label} (${i.bourse})`)
    .join("\n");
  return clip(`Tes prochaines échéances :\n${lines}\n\nTon tracker : ${link}`);
}

export function formatActions(
  items: { bourse: string; action: string | null; readiness: number }[],
  link: string,
) {
  const open = items.filter((i) => i.action);
  if (open.length === 0) return clip(`Rien d'urgent ! Tes candidatures : ${link}`);
  const lines = open.map((i) => `• ${i.bourse} (${i.readiness} %) : ${i.action}`).join("\n");
  return clip(`À faire maintenant :\n${lines}\n\n${link}`);
}

export function formatBourses(items: { name: string; closes: string | null }[], link: string) {
  if (items.length === 0)
    return clip(
      `Aucune bourse ouverte ne correspond à ton profil aujourd'hui. Complète ton profil : ${link}`,
    );
  const lines = items
    .slice(0, 6)
    .map((b) => `• ${b.name} — jusqu'au ${formatDateFr(b.closes)}`)
    .join("\n");
  return clip(`Bourses ouvertes pour toi :\n${lines}\n\nSuivre une bourse : ${link}`);
}
