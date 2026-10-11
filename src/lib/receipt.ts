/**
 * Récépissé de paiement en PDF (une page A4, polices standard Helvetica),
 * écrit sans dépendance. Le texte est encodé en WinAnsi pour les accents français.
 */
import { formatFcfa } from "./pricing";

const SPECIAL: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "„": 0x84,
  "…": 0x85,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  œ: 0x9c,
  Œ: 0x8c,
};

/** Encode une chaîne en WinAnsi ; les espaces insécables deviennent des espaces simples. */
export function winAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text.replace(/[\u00a0\u202f]/g, " ")) {
    const code = ch.codePointAt(0) ?? 63;
    if (SPECIAL[ch] !== undefined) out.push(SPECIAL[ch]);
    else if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) out.push(code);
    else out.push(63); // « ? » pour les caractères non représentables
  }
  return out;
}

function pdfString(text: string): number[] {
  const bytes: number[] = [0x28];
  for (const b of winAnsi(text)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) bytes.push(0x5c);
    bytes.push(b);
  }
  bytes.push(0x29);
  return bytes;
}

type Line = { text: string; x: number; y: number; size: number; bold?: boolean };

export function buildTextPdf(lines: Line[], rules: { y: number }[] = []): Uint8Array {
  const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
  const content: number[] = [];
  for (const r of rules) content.push(...ascii(`0.8 G 1 w 56 ${r.y} m 539 ${r.y} l S\n`));
  for (const line of lines) {
    content.push(
      ...ascii(`BT /${line.bold ? "F2" : "F1"} ${line.size} Tf ${line.x} ${line.y} Td `),
    );
    content.push(...pdfString(line.text));
    content.push(...ascii(" Tj ET\n"));
  }

  const chunks: number[][] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (bytes: number[]) => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (id: number, body: number[]) => {
    offsets[id] = length;
    push(ascii(`${id} 0 obj\n`));
    push(body);
    push(ascii("\nendobj\n"));
  };

  push(ascii("%PDF-1.4\n"));
  push([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);
  obj(1, ascii("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  obj(
    3,
    ascii(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] " +
        "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    ),
  );
  obj(
    4,
    ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
  );
  obj(
    5,
    ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
  );
  obj(6, [
    ...ascii(`<< /Length ${content.length} >>\nstream\n`),
    ...content,
    ...ascii("\nendstream"),
  ]);

  const xrefOffset = length;
  let xref = "xref\n0 7\n0000000000 65535 f \n";
  for (let id = 1; id <= 6; id++)
    xref += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  push(ascii(xref));
  push(ascii(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

export type ReceiptData = {
  number: string;
  paidAt: string;
  memberName: string;
  memberCode: string;
  email: string | null;
  description: string;
  amount: number;
  provider: string;
  reference: string | null;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

/** Numéro de reçu lisible et stable : KPB-AAAAMMJJ-XXXXXXXX. */
export function receiptNumber(paymentId: string, paidAt: string) {
  return `KPB-${paidAt.slice(0, 10).replace(/-/g, "")}-${paymentId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function buildReceiptPdf(r: ReceiptData): Uint8Array {
  const rows: [string, string][] = [
    ["Reçu n°", r.number],
    ["Date du paiement", fmtDate(r.paidAt)],
    ["Membre", `${r.memberName || "—"} (${r.memberCode})`],
    ...(r.email ? ([["Email", r.email]] as [string, string][]) : []),
    ["Objet", r.description],
    ["Moyen de paiement", r.provider],
    ...(r.reference ? ([["Référence", r.reference]] as [string, string][]) : []),
  ];
  const lines: Line[] = [
    { text: "KPB Education", x: 56, y: 770, size: 20, bold: true },
    { text: "Reçu de paiement", x: 56, y: 744, size: 13 },
  ];
  let y = 690;
  for (const [label, value] of rows) {
    lines.push({ text: label, x: 56, y, size: 10 });
    lines.push({ text: value, x: 200, y, size: 11, bold: label === "Reçu n°" });
    y -= 26;
  }
  y -= 10;
  lines.push({ text: "Montant réglé", x: 56, y, size: 12, bold: true });
  lines.push({ text: formatFcfa(r.amount), x: 200, y, size: 16, bold: true });
  lines.push({
    text: "Ce reçu atteste du paiement ci-dessus. Merci de votre confiance.",
    x: 56,
    y: 90,
    size: 9,
  });
  lines.push({ text: "KPB Education — Niamey", x: 56, y: 74, size: 9 });
  return buildTextPdf(lines, [{ y: 725 }, { y: y + 30 }]);
}
