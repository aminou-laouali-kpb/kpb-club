/**
 * Photos de téléphone → un PDF A4, entièrement dans le navigateur
 * (le serveur tourne sur Cloudflare Workers, où un traitement d'image n'est pas possible).
 */
import { buildPdfFromJpegs, readJpegInfo, type JpegPage } from "./pdf-writer";

const MAX_SIDE = 1600;
const TARGET_BYTES = 1024 * 1024;

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      // Applique l'orientation EXIF de la photo
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Navigateur ancien : repli sur <img>, qui applique lui aussi l'orientation
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Niveaux de gris + contraste renforcé : rend un document texte lisible et plus léger. */
function enhanceText(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0);
    // Courbe de contraste : éclaircit le fond papier, fonce l'encre
    const v = Math.max(0, Math.min(255, (y - 128) * 1.45 + 128 + 18));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
}

function resized(canvas: HTMLCanvasElement, maxSide: number) {
  const scale = maxSide / Math.max(canvas.width, canvas.height);
  if (scale >= 1) return canvas;
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  out.getContext("2d")?.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Conversion impossible"));
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
      },
      "image/jpeg",
      quality,
    ),
  );
}

async function photoToCanvas(file: Blob, textMode: boolean) {
  const source = await loadBitmap(file);
  const sw = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sh = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: textMode });
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source) source.close();
  if (textMode) enhanceText(ctx, canvas.width, canvas.height);
  return canvas;
}

/**
 * Convertit des photos en un PDF. La qualité JPEG baisse par paliers
 * jusqu'à passer sous 1 Mo (objectif pour les connexions 3G).
 */
export async function photosToPdf(
  files: Blob[],
  opts: { textMode: boolean; onProgress?: (done: number, total: number) => void },
): Promise<{ blob: Blob; pages: number }> {
  const canvases: HTMLCanvasElement[] = [];
  for (const [i, file] of files.entries()) {
    canvases.push(await photoToCanvas(file, opts.textMode));
    opts.onProgress?.(i + 1, files.length);
  }

  // Paliers : qualité JPEG décroissante, puis résolution réduite si nécessaire
  const steps: { quality: number; maxSide: number }[] = [
    { quality: 0.8, maxSide: MAX_SIDE },
    { quality: 0.65, maxSide: MAX_SIDE },
    { quality: 0.5, maxSide: MAX_SIDE },
    { quality: 0.55, maxSide: 1200 },
    { quality: 0.4, maxSide: 1200 },
  ];
  let pdf: Uint8Array | null = null;
  for (const step of steps) {
    const pages: JpegPage[] = [];
    for (const canvas of canvases) {
      const jpeg = await canvasToJpeg(resized(canvas, step.maxSide), step.quality);
      pages.push({ jpeg, ...readJpegInfo(jpeg) });
    }
    pdf = buildPdfFromJpegs(pages);
    if (pdf.length <= TARGET_BYTES) break;
  }
  return {
    blob: new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
    pages: canvases.length,
  };
}

/** Miniature pour l'aperçu avant envoi. */
export function previewUrl(file: Blob) {
  return URL.createObjectURL(file);
}
