import { describe, expect, test } from "bun:test";
import { buildPdfFromJpegs, readJpegInfo } from "../src/lib/pdf-writer";
import { buildZip, crc32 } from "../src/lib/zip-writer";

// JPEG minimal : SOI, SOF0 (hauteur 2, largeur 3, 3 composantes), EOI
const fakeJpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 1, 0x11, 0, 2, 0x11, 1, 3,
  0x11, 1, 0xff, 0xd9,
]);

const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

describe("PDF", () => {
  test("dimensions lues dans le JPEG", () => {
    expect(readJpegInfo(fakeJpeg)).toEqual({ width: 3, height: 2, gray: false });
  });

  test("3 pages, table xref cohérente", () => {
    const pdf = buildPdfFromJpegs(
      [1, 2, 3].map(() => ({ jpeg: fakeJpeg, width: 1200, height: 1600 })),
    );
    const s = text(pdf);
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(s).toContain("/Count 3");
    expect((s.match(/\/Type \/Page /g) ?? []).length).toBe(3);

    const startxref = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(startxref, startxref + 4)).toBe("xref");
    const entries = [...s.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    entries.forEach((offset, i) => {
      expect(s.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  test("refuse une liste vide", () => {
    expect(() => buildPdfFromJpegs([])).toThrow();
  });
});

describe("ZIP", () => {
  test("CRC32 de référence", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  test("structure de l'archive", () => {
    const a = new TextEncoder().encode("bonjour");
    const zip = buildZip([
      { name: "DIALLO_Awa_Passeport.pdf", data: a },
      { name: "relevé.pdf", data: new Uint8Array([1, 2, 3]) },
    ]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralOffset = view.getUint32(end + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
    expect(view.getUint32(14, true)).toBe(crc32(a));
  });
});
