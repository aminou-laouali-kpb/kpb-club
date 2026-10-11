/**
 * Génère la migration qui remplit `knowledge_chunks` (questions-réponses du coach IA)
 * à partir du guide (`src/lib/content.ts`) et des fiches des bourses.
 * Usage : bun scripts/build-knowledge.ts drizzle/migrations/00NN_knowledge_seed.sql
 */
import { writeFileSync } from "node:fs";
import { GUIDE_CHAPTERS } from "../src/lib/content";

const out = process.argv[2];
if (!out) throw new Error("Chemin de sortie manquant");

const sql = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** Découpe un chapitre en sections « ## » ; une section trop courte rejoint la précédente. */
function chunks(body: string, title: string) {
  const parts = body.split(/\n(?=## )/);
  const result: { title: string; content: string }[] = [];
  for (const part of parts) {
    const heading = /^## (.+)$/m.exec(part)?.[1]?.trim();
    const content = part
      .replace(/^## .+$/m, "")
      .replace(/^_.*_$/gm, "")
      .trim();
    if (!content) continue;
    const last = result.at(-1);
    if (last && content.length < 200) last.content += `\n\n${content}`;
    else result.push({ title: heading ? `${title} — ${heading}` : title, content });
  }
  return result;
}

const rows = GUIDE_CHAPTERS.flatMap((chapter, i) =>
  chunks(chapter.body, `Guide, chapitre ${i + 1} : ${chapter.title}`).map((c) => ({
    ref: chapter.slug,
    ...c,
  })),
);

const lines = [
  "-- Généré par scripts/build-knowledge.ts : base de connaissances du coach IA",
  "DELETE FROM public.knowledge_chunks WHERE source = 'guide';",
  ...rows.map(
    (r) =>
      `INSERT INTO public.knowledge_chunks (source, ref, title, content) VALUES ('guide', ${sql(r.ref)}, ${sql(r.title)}, ${sql(r.content)});`,
  ),
  "",
  "-- Fiches des bourses (rejouer après une mise à jour du catalogue)",
  "DELETE FROM public.knowledge_chunks WHERE source = 'bourse';",
  `INSERT INTO public.knowledge_chunks (source, ref, title, content)
SELECT 'bourse', b.id, 'Bourse : ' || b.university_name,
  concat_ws(E'\\n',
    'Pays : ' || b.country,
    'Niveau minimum : ' || coalesce(b.min_education, 'non précisé'),
    CASE WHEN b.max_age IS NOT NULL THEN 'Âge maximum : ' || b.max_age END,
    CASE WHEN b.english_required THEN 'Anglais requis' ELSE 'Anglais non requis' END,
    CASE WHEN b.gender_restriction = 'F' THEN 'Réservée aux femmes' END,
    CASE WHEN b.financial_need_required THEN 'Réservée aux candidats ayant un besoin de financement' END,
    'Fenêtre de dépôt : du ' || coalesce(to_char(b.window_opens, 'DD/MM/YYYY'), '?') || ' au ' || coalesce(to_char(b.window_closes, 'DD/MM/YYYY'), '?'),
    b.notes)
FROM public.bourses b;`,
  "",
];
writeFileSync(out, lines.join("\n"));
console.log(`${rows.length} extraits du guide écrits dans ${out}`);
