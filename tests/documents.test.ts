import { describe, expect, test } from "bun:test";
import {
  FREE_DOCUMENT_LIMIT,
  checkQuota,
  expiryState,
  exportFileName,
  formatBytes,
  uniqueNames,
} from "../src/lib/documents";
import {
  buildRequestMessage,
  isRecommendationItemDone,
  isReminderDue,
  whatsappLink,
} from "../src/lib/recommenders";

describe("quotas", () => {
  test("gratuit : 3 documents", () => {
    const base = { hasAccess: false, usedBytes: 0, newBytes: 1000 };
    expect(checkQuota({ ...base, documentCount: FREE_DOCUMENT_LIMIT - 1 }).ok).toBe(true);
    expect(checkQuota({ ...base, documentCount: FREE_DOCUMENT_LIMIT }).ok).toBe(false);
  });
  test("Club : 200 Mo, fichier de 10 Mo maximum", () => {
    const mb = 1024 * 1024;
    expect(
      checkQuota({ hasAccess: true, documentCount: 50, usedBytes: 195 * mb, newBytes: 4 * mb }).ok,
    ).toBe(true);
    expect(
      checkQuota({ hasAccess: true, documentCount: 50, usedBytes: 199 * mb, newBytes: 2 * mb }).ok,
    ).toBe(false);
    expect(
      checkQuota({ hasAccess: true, documentCount: 0, usedBytes: 0, newBytes: 11 * mb }).ok,
    ).toBe(false);
  });
});

describe("expirations", () => {
  const now = Date.UTC(2026, 9, 9);
  test("états", () => {
    expect(expiryState(null, now)).toBe("none");
    expect(expiryState("2026-10-01", now)).toBe("expired");
    expect(expiryState("2026-12-01", now)).toBe("soon");
    expect(expiryState("2028-01-01", now)).toBe("ok");
  });
});

describe("noms de fichiers", () => {
  test("NOM_Prenom_Libelle", () => {
    expect(exportFileName("Awa Fatima Diallo", "Relevé L3 — 2025")).toBe(
      "DIALLO_Awa_Fatima_Releve_L3_2025.pdf",
    );
    expect(exportFileName("Moussa", "Passeport")).toBe("MOUSSA_Passeport.pdf");
    expect(exportFileName("", "")).toBe("document.pdf");
  });
  test("doublons", () => {
    expect(uniqueNames(["a.pdf", "a.pdf", "b.pdf", "a.pdf"])).toEqual([
      "a.pdf",
      "a_2.pdf",
      "b.pdf",
      "a_3.pdf",
    ]);
  });
  test("tailles", () => {
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(1536 * 1024)).toBe("1,5 Mo");
  });
});

describe("recommandateurs", () => {
  test("message de demande", () => {
    const m = buildRequestMessage({
      studentName: "Awa Diallo",
      recommender: { full_name: "Diallo", title: "Pr." },
      bourseName: "Sciences Po",
      deadline: "2027-01-15",
      strengths: "Rigueur\n- Leadership associatif",
    });
    expect(m.subject).toContain("Sciences Po");
    expect(m.body.startsWith("Bonjour Pr. Diallo,")).toBe(true);
    expect(m.body).toContain("- Rigueur\n- Leadership associatif");
    expect(m.body).toContain("15 janvier 2027");
    expect(m.body.trimEnd().endsWith("Awa Diallo")).toBe(true);
  });
  test("lien WhatsApp", () => {
    expect(whatsappLink("+227 90 12 34 56", "a b")).toBe("https://wa.me/22790123456?text=a%20b");
    expect(whatsappLink("0033768674292", "x")).toBe("https://wa.me/33768674292?text=x");
  });
  test("relance à J+7, une seule fois", () => {
    const now = Date.UTC(2026, 9, 9);
    const sent = (days: number) => new Date(now - days * 86_400_000).toISOString();
    expect(
      isReminderDue({ status: "requested", requested_at: sent(8), reminded_at: null }, now),
    ).toBe(true);
    expect(
      isReminderDue({ status: "requested", requested_at: sent(3), reminded_at: null }, now),
    ).toBe(false);
    expect(
      isReminderDue({ status: "requested", requested_at: sent(8), reminded_at: sent(1) }, now),
    ).toBe(false);
    expect(
      isReminderDue({ status: "received", requested_at: sent(8), reminded_at: null }, now),
    ).toBe(false);
  });
  test("item fait quand assez de lettres", () => {
    expect(isRecommendationItemDone(1, 2)).toBe(false);
    expect(isRecommendationItemDone(2, 2)).toBe(true);
    expect(isRecommendationItemDone(1, null)).toBe(true);
  });
});
