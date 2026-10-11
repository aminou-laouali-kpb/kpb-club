/**
 * Génère la migration qui copie le guide et les modèles de `src/lib/content.ts` en base.
 * Usage : bun scripts/build-content.ts drizzle/migrations/00NN_content_seed.sql
 * Ensuite, les contenus se gèrent dans l'admin (phase 7).
 */
import { writeFileSync } from "node:fs";
import { GUIDE_CHAPTERS, TEMPLATES } from "../src/lib/content";

const out = process.argv[2];
if (!out) throw new Error("Chemin de sortie manquant");
const sql = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);

const CATEGORY: Record<string, string> = {
  "cv-academique": "cv",
  "lettre-motivation": "motivation",
  "essai-personnel": "essay",
  "lettre-recommandation": "recommendation",
};

// Champs remplis avec le profil du membre à l'affichage
const PREFILL: Record<string, (body: string) => string> = {
  "cv-academique": (b) =>
    b.replace(
      "**Nom Prénom** — ville, pays — email — téléphone",
      "**{{full_name}}** — {{residence}} — {{email}} — {{phone}}",
    ),
  "lettre-motivation": (b) => `{{full_name}}\n{{residence}}\n\n${b}`,
};

const lines = [
  "-- Généré par scripts/build-content.ts : contenus du guide et modèles",
  ...GUIDE_CHAPTERS.map(
    (c, i) =>
      `INSERT INTO public.content_chapters (slug, title, summary, body_md, sort_order, published) VALUES (${sql(c.slug)}, ${sql(c.title)}, ${sql(c.summary)}, ${sql(c.body)}, ${i + 1}, true) ON CONFLICT (slug) DO NOTHING;`,
  ),
  ...TEMPLATES.map((t, i) => {
    const prefill = PREFILL[t.slug];
    return `INSERT INTO public.content_templates (slug, title, summary, category, body_md, prefill, published, sort_order) VALUES (${sql(t.slug)}, ${sql(t.title)}, ${sql(t.summary)}, ${sql(CATEGORY[t.slug] ?? null)}, ${sql(prefill ? prefill(t.body) : t.body)}, ${prefill ? "true" : "false"}, true, ${i + 1}) ON CONFLICT (slug) DO NOTHING;`;
  }),
  "",
  "-- Bibliothèque : publications de démonstration",
  `INSERT INTO public.content_posts (kind, title, body_md, url, notify, published_at) VALUES
('method', 'Méthode : 5 erreurs qui coûtent une bourse (démo)', 'Publication de démonstration à remplacer. Date limite mal lue, lettre générique, pièce manquante, recommandation tardive, essai trop long.', NULL, false, now()),
('video', 'L''université décortiquée : Sciences Po (démo)', 'Vidéo de démonstration à remplacer.', 'https://www.youtube.com/', false, now()),
('news', 'Bulletin du lundi (démo)', 'Publication de démonstration : les fenêtres qui ouvrent cette semaine.', NULL, false, now());`,
  "",
];
writeFileSync(out, lines.join("\n"));
console.log(`${GUIDE_CHAPTERS.length} chapitres et ${TEMPLATES.length} modèles écrits dans ${out}`);
