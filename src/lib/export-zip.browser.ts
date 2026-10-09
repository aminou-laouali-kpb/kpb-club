import { buildZip } from "./zip-writer";

/** Télécharge les pièces, les assemble en ZIP dans le navigateur et lance l'enregistrement. */
export async function downloadZip(files: { name: string; url: string }[], zipName: string) {
  const entries = [];
  for (const file of files) {
    const res = await fetch(file.url);
    if (!res.ok) throw new Error(`Téléchargement impossible : ${file.name}`);
    entries.push({ name: file.name, data: new Uint8Array(await res.arrayBuffer()) });
  }
  const zip = buildZip(entries);
  const url = URL.createObjectURL(
    new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
