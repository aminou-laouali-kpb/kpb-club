/**
 * Écriture d'un PDF A4 à partir d'images JPEG, sans dépendance.
 * Chaque image occupe une page, centrée et ajustée avec une marge.
 * Le JPEG est embarqué tel quel (filtre DCTDecode) : aucun réencodage.
 */

export type JpegPage = { jpeg: Uint8Array; width: number; height: number; gray?: boolean };

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 18;

const encoder = new TextEncoder();

export function buildPdfFromJpegs(pages: JpegPage[]): Uint8Array {
  if (pages.length === 0) throw new Error("Aucune page");
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body();
    push("\nendobj\n");
  };

  // Objets : 1 catalogue, 2 arbre des pages, puis 3 objets par page (page, image, contenu)
  const pageIds = pages.map((_, i) => 3 + i * 3);
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () =>
    push(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ),
  );

  pages.forEach((page, i) => {
    const pageId = 3 + i * 3;
    const imageId = pageId + 1;
    const contentId = pageId + 2;
    const scale = Math.min(
      (A4_WIDTH - 2 * MARGIN) / page.width,
      (A4_HEIGHT - 2 * MARGIN) / page.height,
    );
    const w = page.width * scale;
    const h = page.height * scale;
    const x = (A4_WIDTH - w) / 2;
    const y = (A4_HEIGHT - h) / 2;
    const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;

    object(pageId, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] ` +
          `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
    object(imageId, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
          `/ColorSpace /${page.gray ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 ` +
          `/Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      );
      push(page.jpeg);
      push("\nendstream");
    });
    object(contentId, () =>
      push(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`),
    );
  });

  const count = 3 + pages.length * 3;
  const xrefOffset = length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++)
    xref += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/** Lit les dimensions et le nombre de composantes d'un JPEG (marqueur SOF). */
export function readJpegInfo(jpeg: Uint8Array): { width: number; height: number; gray: boolean } {
  const at = (n: number) => jpeg[n] ?? 0;
  let i = 2;
  while (i < jpeg.length) {
    if (at(i) !== 0xff) {
      i++;
      continue;
    }
    const marker = at(i + 1);
    const size = (at(i + 2) << 8) | at(i + 3);
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      return {
        height: (at(i + 5) << 8) | at(i + 6),
        width: (at(i + 7) << 8) | at(i + 8),
        gray: at(i + 9) === 1,
      };
    }
    i += 2 + size;
  }
  throw new Error("JPEG invalide");
}
