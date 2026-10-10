/** Filigrane inséré dans le texte du contenu payant (survit à la copie et au cache hors ligne). */

export function watermarkText(
  fullName: string | null | undefined,
  memberCode: string | null | undefined,
) {
  const name = (fullName ?? "").trim() || "Membre";
  return `${name.toUpperCase()} — ${memberCode ?? "KPB"}`;
}

/**
 * Insère une ligne de filigrane tous les `every` paragraphes du Markdown.
 * La ligne est un paragraphe en italique, discret à l'affichage.
 */
export function embedWatermark(markdown: string, mark: string, every = 6) {
  const blocks = markdown.split(/\n{2,}/);
  const out: string[] = [];
  blocks.forEach((block, i) => {
    out.push(block);
    if ((i + 1) % every === 0 && i < blocks.length - 1) out.push(`_${mark}_`);
  });
  out.push(`_${mark} · Contenu réservé aux membres du Club Boursier_`);
  return out.join("\n\n");
}

/** Remplit les champs {{...}} d'un modèle avec le profil ; un champ vide reste lisible. */
export function prefillTemplate(body: string, values: Record<string, string | null | undefined>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = values[key];
    return v && v.trim() ? v : `[${key.replace(/_/g, " ")}]`;
  });
}
