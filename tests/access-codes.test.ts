import { describe, expect, test } from "bun:test";
import {
  CODE_ALPHABET,
  formatAccessCode,
  generateAccessCode,
  isValidAccessCodeFormat,
  normalizeAccessCode,
} from "../src/lib/access-codes";

describe("codes d'accès", () => {
  test("16 caractères de l'alphabet sans ambiguïté", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateAccessCode();
      expect(code).toHaveLength(16);
      expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
      expect(isValidAccessCodeFormat(code)).toBe(true);
    }
    expect(CODE_ALPHABET).not.toMatch(/[O0I1]/);
  });

  test("pas de doublon sur un gros lot", () => {
    const set = new Set(Array.from({ length: 5000 }, generateAccessCode));
    expect(set.size).toBe(5000);
  });

  test("normalisation de la saisie", () => {
    expect(normalizeAccessCode(" abcd-efgh jkmn-pq23 ")).toBe("ABCDEFGHJKMNPQ23");
    expect(isValidAccessCodeFormat(normalizeAccessCode("abcd-efgh-jkmn-pq23"))).toBe(true);
    expect(isValidAccessCodeFormat("ABCDEFGHJKMNPQ2")).toBe(false);
    expect(isValidAccessCodeFormat("ABCDEFGHJKMNPQ20")).toBe(false); // 0 exclu
  });

  test("affichage par groupes de 4", () => {
    expect(formatAccessCode("ABCDEFGHJKMNPQ23")).toBe("ABCD-EFGH-JKMN-PQ23");
  });
});
