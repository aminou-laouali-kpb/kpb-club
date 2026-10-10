import { describe, expect, test } from "bun:test";
import { engagementPlan } from "../src/lib/pricing";
import {
  generateReferralCode,
  normalizeReferralCode,
  progressToNextReward,
  referralLink,
  rewardsDue,
} from "../src/lib/referrals";
import { localTime, nextSendTime, timezoneForCountry } from "../src/lib/relance/window";
import {
  engagementNudgeDue,
  inactivityDue,
  isoWeek,
  secondInstallmentReminder,
} from "../src/lib/relance/rules";
import { buildReceiptPdf, receiptNumber, winAnsi } from "../src/lib/receipt";

describe("échéancier d'accompagnement", () => {
  test("2 tranches, crédit sur la première", () => {
    expect(engagementPlan("single", 2, 15_000)).toEqual({
      total: 90_000,
      firstGross: 45_000,
      first: 30_000,
      second: 45_000,
      credit: 15_000,
    });
  });
  test("1 tranche sans crédit", () => {
    expect(engagementPlan("concierge", 1, 0)).toMatchObject({
      first: 690_000,
      second: 0,
      credit: 0,
    });
  });
  test("le crédit ne rend jamais la tranche négative", () => {
    expect(engagementPlan("single", 2, 100_000).first).toBe(0);
    expect(engagementPlan("single", 2, -5).credit).toBe(0);
  });
});

describe("parrainage", () => {
  test("codes", () => {
    const code = generateReferralCode();
    expect(code).toMatch(/^KPB-[A-Z2-9]{6}$/);
    expect(normalizeReferralCode(code.toLowerCase())).toBe(code);
    expect(normalizeReferralCode("kpb abc234")).toBe("KPB-ABC234");
    expect(normalizeReferralCode("ABC234")).toBe("KPB-ABC234");
    expect(normalizeReferralCode("KPB-ABC10")).toBeNull();
    expect(referralLink("https://kpb.app/", "KPB-ABC234")).toBe("https://kpb.app/?ref=KPB-ABC234");
  });
  test("une récompense par paire, plus anciens d'abord", () => {
    const r = (id: string, d: string) => ({ id, paid_at: `2026-10-0${d}T00:00:00Z` });
    expect(rewardsDue([r("a", "1")])).toEqual([]);
    expect(rewardsDue([r("b", "2"), r("a", "1")])).toEqual([["a", "b"]]);
    expect(rewardsDue([r("c", "3"), r("a", "1"), r("b", "2")])).toEqual([["a", "b"]]);
    expect(rewardsDue([r("d", "4"), r("c", "3"), r("a", "1"), r("b", "2")])).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(progressToNextReward(1, 2)).toBe(1);
  });
});

describe("fenêtre d'envoi 8 h – 20 h", () => {
  test("fuseaux par pays", () => {
    expect(timezoneForCountry("NE")).toBe("Africa/Niamey");
    expect(timezoneForCountry("cm")).toBe("Africa/Douala");
    expect(timezoneForCountry(null)).toBe("Africa/Niamey");
  });
  test("dans la fenêtre : immédiat", () => {
    const now = new Date("2026-10-10T10:00:00Z"); // 11 h à Niamey
    expect(nextSendTime(now, "Africa/Niamey")).toEqual(now);
  });
  test("avant 8 h : 8 h le jour même", () => {
    const now = new Date("2026-10-10T03:30:00Z"); // 4 h 30 à Niamey
    expect(nextSendTime(now, "Africa/Niamey").toISOString()).toBe("2026-10-10T07:00:00.000Z");
  });
  test("après 20 h : 8 h le lendemain", () => {
    const now = new Date("2026-10-10T21:15:00Z"); // 21 h 15 à Dakar (UTC)
    expect(nextSendTime(now, "Africa/Dakar").toISOString()).toBe("2026-10-11T08:00:00.000Z");
  });
  test("Paris, changement d'heure du 25 octobre 2026", () => {
    const now = new Date("2026-10-24T20:30:00Z"); // 22 h 30 à Paris (UTC+2)
    const next = nextSendTime(now, "Europe/Paris");
    expect(localTime(next, "Europe/Paris")).toEqual({ hour: 8, minute: 0 });
    expect(next.toISOString()).toBe("2026-10-25T07:00:00.000Z"); // 8 h en UTC+1
  });
  test("fuseau invalide : Niamey", () => {
    const now = new Date("2026-10-10T03:00:00Z");
    expect(nextSendTime(now, "Mars/Olympus").toISOString()).toBe("2026-10-10T07:00:00.000Z");
  });
  test("aucun envoi calculé hors 8 h – 20 h", () => {
    for (const tz of ["Africa/Niamey", "Africa/Douala", "Europe/Paris", "America/Toronto"]) {
      for (let h = 0; h < 48; h++) {
        const t = nextSendTime(new Date(Date.UTC(2026, 9, 10, h, 17)), tz);
        const { hour } = localTime(t, tz);
        expect(hour >= 8 && hour < 20).toBe(true);
      }
    }
  });
});

describe("règles de relance", () => {
  const now = new Date("2026-10-10T09:00:00Z");
  test("2e tranche : J-5, J-1, J0, J+3, une seule fois chacune", () => {
    expect(secondInstallmentReminder("2026-10-15", now, {})).toBe("t2_j5");
    expect(secondInstallmentReminder("2026-10-15", now, { reminder_t2_j5_sent: true })).toBeNull();
    expect(secondInstallmentReminder("2026-10-11", now, {})).toBe("t2_j1");
    expect(secondInstallmentReminder("2026-10-10", now, {})).toBe("t2_j0");
    expect(secondInstallmentReminder("2026-10-07", now, {})).toBe("t2_jp3");
    expect(secondInstallmentReminder("2026-10-13", now, {})).toBeNull();
    expect(secondInstallmentReminder(null, now, {})).toBeNull();
  });
  test("engagement : dû sous 7 jours et 5 jours sans activité", () => {
    const item = { status: "todo", due_date: "2026-10-15" };
    expect(engagementNudgeDue(item, "2026-10-04T00:00:00Z", now)).toBe(true);
    expect(engagementNudgeDue(item, "2026-10-08T00:00:00Z", now)).toBe(false);
    expect(engagementNudgeDue({ ...item, due_date: "2026-10-30" }, null, now)).toBe(false);
    expect(engagementNudgeDue({ ...item, status: "done" }, null, now)).toBe(false);
  });
  test("semaine ISO", () => {
    expect(isoWeek(new Date("2026-10-10T00:00:00Z"))).toBe("2026-W41");
    expect(isoWeek(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });
  test("inactivité : 14 jours, clé par période", () => {
    expect(inactivityDue("2026-09-20T10:00:00Z", now)).toBe("2026-09-20");
    expect(inactivityDue("2026-10-01T10:00:00Z", now)).toBeNull();
    expect(inactivityDue(null, now)).toBeNull();
  });
});

describe("reçu", () => {
  test("encodage WinAnsi", () => {
    expect(winAnsi("é—€")).toEqual([0xe9, 0x97, 0x80]);
    expect(winAnsi("30 000 FCFA")).toEqual(winAnsi("30 000 FCFA"));
    expect(winAnsi("漢")).toEqual([63]);
  });
  test("PDF valide", () => {
    const pdf = buildReceiptPdf({
      number: receiptNumber("12345678-aaaa-bbbb-cccc-dddddddddddd", "2026-10-10T09:00:00Z"),
      paidAt: "2026-10-10T09:00:00Z",
      memberName: "Awa Diallo",
      memberCode: "AB12",
      email: "awa@example.com",
      description: "Club Boursier — formule trimestrielle",
      amount: 30_000,
      provider: "Maketou (Wave)",
      reference: "TX-1 (test)",
    });
    const s = new TextDecoder("latin1").decode(pdf);
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s).toContain("KPB-20261010-12345678");
    expect(s).toContain("(TX-1 \\(test\\))");
  });
});
