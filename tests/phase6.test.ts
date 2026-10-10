import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { isSyntheticEmail, maskPhone, normalizePhone, syntheticEmail } from "../src/lib/phone";
import { canSend, canVerify, generateCode, hashCode, safeEqual } from "../src/lib/otp";
import {
  WA_MAX_LENGTH,
  formatDeadlines,
  formatMenu,
  parseCommand,
} from "../src/lib/whatsapp/commands";
import { verifyMetaSignature } from "../src/lib/whatsapp/signature";
import { assessLevel, requirementGap, toIelts, usefulSessions } from "../src/lib/english";
import { categoryOf, channelsFor, type Prefs } from "../src/lib/notification-prefs";
import { embedWatermark, prefillTemplate, watermarkText } from "../src/lib/watermark";

describe("téléphones", () => {
  test("formats locaux et internationaux", () => {
    expect(normalizePhone("90 12 34 56", "NE")).toBe("+22790123456");
    expect(normalizePhone("+227 90 12 34 56")).toBe("+22790123456");
    expect(normalizePhone("0022790123456")).toBe("+22790123456");
    expect(normalizePhone("22790123456")).toBe("+22790123456");
    expect(normalizePhone("77 123 45 67", "SN")).toBe("+221771234567");
    expect(normalizePhone("07 12 34 56 78", "CI")).toBe("+2250712345678");
    expect(normalizePhone("6 71 23 45 67", "CM")).toBe("+237671234567");
    expect(normalizePhone("01 97 12 34 56", "BJ")).toBe("+2290197123456");
    expect(normalizePhone("70 12 34 56", "BF")).toBe("+22670123456");
    expect(normalizePhone("76 12 34 56", "ML")).toBe("+22376123456");
    expect(normalizePhone("90 12 34 56", "TG")).toBe("+22890123456");
    expect(normalizePhone("620 12 34 56", "GN")).toBe("+224620123456");
    expect(normalizePhone("081 234 5678", "CD")).toBe("+243812345678");
    expect(normalizePhone("07 68 67 42 92", "FR")).toBe("+33768674292");
  });
  test("numéros invalides", () => {
    expect(normalizePhone("123", "NE")).toBeNull();
    expect(normalizePhone("", "NE")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });
  test("masque et adresse technique", () => {
    expect(maskPhone("+22790123456")).toBe("+227•••• 34 56");
    expect(syntheticEmail("+22790123456")).toBe("22790123456@phone.kpb.invalid");
    expect(isSyntheticEmail("22790123456@phone.kpb.invalid")).toBe(true);
    expect(isSyntheticEmail("a@b.com")).toBe(false);
  });
});

describe("codes de connexion", () => {
  test("6 chiffres, répartis", () => {
    const codes = Array.from({ length: 2000 }, generateCode);
    expect(codes.every((c) => /^\d{6}$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(1990);
  });
  test("empreinte liée au numéro et au secret", async () => {
    const a = await hashCode("123456", "+22790123456", "s");
    expect(a).toHaveLength(64);
    expect(await hashCode("123456", "+22790123456", "s")).toBe(a);
    expect(await hashCode("123456", "+22790123457", "s")).not.toBe(a);
    expect(await hashCode("123456", "+22790123456", "t")).not.toBe(a);
    expect(safeEqual(a, a)).toBe(true);
    expect(safeEqual(a, a.replace(/.$/, "0"))).toBe(a.endsWith("0"));
  });
  test("limites", () => {
    expect(canSend(4)).toBe(true);
    expect(canSend(5)).toBe(false);
    expect(canVerify(4)).toBe(true);
    expect(canVerify(5)).toBe(false);
  });
});

describe("bot WhatsApp", () => {
  test("commandes, accents et casse", () => {
    expect(parseCommand("Statut")).toBe("status");
    expect(parseCommand("  mon statut ! ")).toBe("status");
    expect(parseCommand("ÉCHÉANCES")).toBe("deadlines");
    expect(parseCommand("deadlines")).toBe("deadlines");
    expect(parseCommand("Quoi faire ?")).toBe("actions");
    expect(parseCommand("bourses")).toBe("bourses");
    expect(parseCommand("Aide")).toBe("help");
    expect(parseCommand("humain")).toBe("agent");
    expect(parseCommand("Quels documents pour Sciences Po ?")).toBe("question");
  });
  test("réponses courtes", () => {
    expect(formatMenu().length).toBeLessThanOrEqual(WA_MAX_LENGTH);
    const many = Array.from({ length: 40 }, (_, i) => ({
      label: `Élément très long numéro ${i} avec beaucoup de texte descriptif`,
      bourse: "Université avec un nom particulièrement long",
      dueDate: "2026-12-01",
    }));
    const text = formatDeadlines(many, "https://kpb.app/candidatures");
    expect(text.length).toBeLessThanOrEqual(WA_MAX_LENGTH);
    expect((text.match(/•/g) ?? []).length).toBe(5);
  });
  test("signature Meta", async () => {
    const body = JSON.stringify({ object: "whatsapp_business_account" });
    const sig = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(await verifyMetaSignature(body, sig, "secret")).toBe(true);
    expect(await verifyMetaSignature(body, sig, "autre")).toBe(false);
    expect(await verifyMetaSignature(`${body} `, sig, "secret")).toBe(false);
    expect(await verifyMetaSignature(body, null, "secret")).toBe(false);
  });
});

describe("anglais", () => {
  test("auto-évaluation", () => {
    expect(assessLevel([1, 1, 0, 1, 1, 1, 2, 1, 1, 1]).level).toBe("C1");
    expect(assessLevel([1, 1, 0, 1, 1, 0, 0, 0, 0, 0]).level).toBe("B1");
    expect(assessLevel([]).level).toBe("A2");
  });
  test("équivalences et écart", () => {
    expect(toIelts("toefl", 95)).toBe(7);
    expect(toIelts("duolingo", 115)).toBe(6.5);
    const req = [
      { test: "ielts" as const, min_score: 6.5 },
      { test: "toefl" as const, min_score: 90 },
    ];
    expect(requirementGap({ test: "ielts", score: 7 }, req).status).toBe("ok");
    expect(requirementGap({ test: "ielts", score: 6 }, req)).toMatchObject({
      status: "short",
      gap: 0.5,
    });
    expect(requirementGap({ test: "duolingo", score: 120 }, req).status).toBe("ok");
    expect(requirementGap({ test: "none", score: null }, req).status).toBe("missing");
    expect(requirementGap({ test: "ielts", score: 5 }, []).status).toBe("none");
  });
  test("sessions utiles avant la date limite", () => {
    const s = [
      { test: "ielts", session_date: "2026-11-14", results_days: 13 },
      { test: "ielts", session_date: "2026-12-20", results_days: 13 },
      { test: "duolingo", session_date: "2026-10-01", results_days: 2 },
    ];
    expect(usefulSessions(s, "2026-12-01", "2026-10-10").map((x) => x.session_date)).toEqual([
      "2026-11-14",
    ]);
  });
});

describe("préférences de notification", () => {
  const base: Prefs = {
    email: "a@b.com",
    phone_e164: "+22790123456",
    phone_verified_at: "2026-10-01",
    email_optin: true,
    notif_email: true,
    whatsapp_optin: true,
    notif_whatsapp_alerts: true,
    notif_whatsapp_reminders: true,
    notif_whatsapp_content: true,
  };
  test("catégories", () => {
    expect(categoryOf("bourse_alert")).toBe("alerts");
    expect(categoryOf("content_post")).toBe("content");
    expect(categoryOf("subscription_j7")).toBe("reminders");
  });
  test("les deux canaux par défaut", () => {
    expect(channelsFor("subscription_j7", base)).toEqual({ email: true, whatsapp: true });
  });
  test("téléphone non vérifié : email seulement", () => {
    expect(channelsFor("bourse_alert", { ...base, phone_verified_at: null })).toEqual({
      email: true,
      whatsapp: false,
    });
  });
  test("pas de désabonnement silencieux : rappel par email si tout est coupé", () => {
    const off = { ...base, notif_email: false, notif_whatsapp_reminders: false };
    expect(channelsFor("subscription_j7", off)).toEqual({ email: true, whatsapp: false });
    // Une alerte de contenu, elle, respecte le choix
    expect(channelsFor("content_post", { ...off, notif_whatsapp_content: false })).toEqual({
      email: false,
      whatsapp: false,
    });
  });
  test("WhatsApp seul si l'email est coupé", () => {
    expect(channelsFor("subscription_j7", { ...base, notif_email: false })).toEqual({
      email: false,
      whatsapp: true,
    });
  });
});

describe("filigrane et modèles", () => {
  test("ligne de filigrane insérée", () => {
    const md = Array.from({ length: 13 }, (_, i) => `Paragraphe ${i}`).join("\n\n");
    const mark = watermarkText("Awa Diallo", "AB12");
    const out = embedWatermark(md, mark, 6);
    expect(mark).toBe("AWA DIALLO — AB12");
    expect(out.split(mark).length - 1).toBe(3);
    expect(out.trimEnd().endsWith("Club Boursier_")).toBe(true);
  });
  test("pré-remplissage", () => {
    expect(
      prefillTemplate("**{{full_name}}** — {{residence}}", { full_name: "Awa", residence: "" }),
    ).toBe("**Awa** — [residence]");
  });
});
