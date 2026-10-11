import { describe, expect, test } from "bun:test";
import {
  activeMembers,
  cohortRetention,
  featuresBeforeChurn,
  findChurned,
  funnel,
  monthlyChurn,
  mrr,
  renewalsDue,
  type Sub,
} from "../src/lib/metrics";
import {
  bourseSchema,
  duplicateBourse,
  duplicateId,
  toBoursesJson,
  type BourseRow,
  type RequirementRow,
} from "../src/lib/admin/bourses";
import { matchesSegment, memberStatus, type SegmentMember } from "../src/lib/admin/segment";
import { CONSENT_VERSION, deletionDueAt, isDeletionDue, needsConsent } from "../src/lib/privacy";
import { buildCsp, withSecurityHeaders } from "../src/lib/security-headers";
import { categoryOf, channelsFor, type Prefs } from "../src/lib/notification-prefs";

const NOW = new Date("2026-10-15T12:00:00Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

function sub(p: Partial<Sub> & { profile_id: string; ends: number }): Sub {
  return {
    id: `${p.profile_id}-${p.ends}`,
    plan: "monthly",
    amount: 15_000,
    grace_ends_at: at(p.ends + 3),
    ends_at: at(p.ends),
    status: "active",
    ...p,
  };
}

describe("indicateurs", () => {
  const subs: Sub[] = [
    sub({ profile_id: "a", ends: 10 }), // mensuel en cours
    sub({ profile_id: "b", ends: 60, plan: "quarterly", amount: 30_000 }), // trimestriel en cours
    sub({ profile_id: "c", ends: 5, amount: 0, source: "grant" }), // offert : pas de revenu
    sub({ profile_id: "d", ends: -20 }), // parti
    sub({ profile_id: "e", ends: -1 }), // en délai de grâce
  ];

  test("membres actifs (délai de grâce compris)", () => {
    expect(activeMembers(subs, NOW)).toBe(4);
  });

  test("MRR : trimestriel ramené au mois, offerts exclus", () => {
    expect(mrr(subs, NOW)).toBe(15_000 + 10_000);
  });

  test("une prolongation empilée ne double pas le MRR", () => {
    const stacked = [sub({ profile_id: "a", ends: 10 }), sub({ profile_id: "a", ends: 40 })];
    expect(mrr(stacked, NOW)).toBe(15_000);
  });

  test("fins d'accès sous 7 jours, sans renouvellement", () => {
    expect(renewalsDue(subs, NOW, 7)).toBe(1); // c (a finit dans 10 j)
    expect(renewalsDue([...subs, sub({ profile_id: "c", ends: 35 })], NOW, 7)).toBe(0);
  });

  test("churn du mois", () => {
    // Actifs au 1er octobre : a, b, c, e (d a fini le 25/09 + 3 j de grâce = 28/09)
    const churn = monthlyChurn(subs, NOW);
    expect(churn.activeAtStart).toBe(4);
    expect(churn.churned).toBe(0); // e est encore en délai de grâce
    const later = new Date(NOW.getTime() + 5 * DAY);
    expect(monthlyChurn(subs, later).churned).toBe(1);
  });

  test("churned : 7 jours après la fin d'accès, une seule fois", () => {
    const list = [sub({ profile_id: "x", ends: -12 }), sub({ profile_id: "y", ends: -5 })];
    const found = findChurned(list, new Set(), NOW);
    expect(found.map((f) => f.profile_id)).toEqual(["x"]);
    expect(findChurned(list, new Set([found[0]!.subscription_id]), NOW)).toEqual([]);
    // Renouvelé depuis : la ligne la plus lointaine décide
    expect(findChurned([...list, sub({ profile_id: "x", ends: 20 })], new Set(), NOW)).toHaveLength(
      0,
    );
  });

  test("rétention par cohorte", () => {
    const profiles = [
      { id: "p1", created_at: "2026-09-03T00:00:00Z" },
      { id: "p2", created_at: "2026-09-20T00:00:00Z" },
      { id: "p3", created_at: "2026-10-02T00:00:00Z" },
    ];
    const events = [
      { profile_id: "p1", name: "item_done", created_at: "2026-09-04T00:00:00Z" },
      { profile_id: "p2", name: "chapter_read", created_at: "2026-09-21T00:00:00Z" },
      { profile_id: "p1", name: "item_done", created_at: "2026-10-05T00:00:00Z" },
      { profile_id: "p3", name: "signup", created_at: "2026-10-02T00:00:00Z" },
    ];
    const rows = cohortRetention(profiles, events, NOW, 2);
    expect(rows).toEqual([
      { cohort: "2026-09", size: 2, retention: [100, 50] },
      { cohort: "2026-10", size: 1, retention: [0] },
    ]);
  });

  test("entonnoir", () => {
    const f = funnel({
      profileIds: ["a", "b", "c", "d"],
      clubProfileIds: ["a", "b", "a", null],
      accompanimentProfileIds: ["b"],
    });
    expect(f.map((s) => [s.count, s.rate])).toEqual([
      [4, 100],
      [2, 50],
      [1, 25],
    ]);
  });

  test("fonctionnalités avant un churn", () => {
    const churnAt = new Date("2026-10-20T00:00:00Z");
    const end = new Date(churnAt.getTime() - 7 * DAY);
    const events = [
      { profile_id: "z", name: "churned", created_at: churnAt.toISOString() },
      {
        profile_id: "z",
        name: "chapter_read",
        created_at: new Date(end.getTime() - 2 * DAY).toISOString(),
      },
      {
        profile_id: "z",
        name: "item_done",
        created_at: new Date(end.getTime() - 30 * DAY).toISOString(),
      },
    ];
    const r = featuresBeforeChurn(events);
    expect(r.churns).toBe(1);
    expect(r.usage.find((u) => u.feature === "chapter_read")?.count).toBe(1);
    expect(r.usage.find((u) => u.feature === "item_done")?.count).toBe(0);
  });
});

const bourse: BourseRow = {
  id: "chevening-2026",
  university_name: "Chevening",
  country: "Royaume-Uni",
  program_url: "https://www.chevening.org",
  eligible_nationalities: ["NE", "SN"],
  gender_restriction: "all",
  min_education: "licence",
  max_age: null,
  english_required: true,
  financial_need_required: false,
  window_opens: "2026-08-05",
  window_closes: "2027-02-29".replace("02-29", "02-28"),
  window_confirmed: true,
  academic_year: 2027,
  notes: null,
  updated_at: "2026-01-01T00:00:00Z",
  operations_order: ["Créer le compte", "Rédiger les essais"],
  whatsapp_group_url: null,
  video_url: null,
  essay_criteria: null,
  interview_format: "panel",
  english_tests: [{ test: "ielts", min_score: 6.5 }],
  verified_by_kpb: true,
  published: true,
  level: ["master"],
  funding: "full",
};

const req = (id: string, order: number, bourseId = bourse.id): RequirementRow => ({
  id,
  bourse_id: bourseId,
  kind: "essay",
  label: `Essai ${order}`,
  description: null,
  document_type: null,
  essay_prompt: "Leadership",
  essay_max_words: 500,
  essay_language: "en",
  recommenders_count: null,
  sort_order: order,
  days_before_deadline: 14,
});

describe("bourses (admin)", () => {
  test("dupliquer pour l'année suivante", () => {
    const copy = duplicateBourse({ ...bourse, window_closes: "2028-02-29" }, [req("r1", 1)], NOW);
    expect(copy.year).toBe(2028);
    expect(copy.bourse.id).toBe("chevening-2028");
    expect(copy.bourse.window_opens).toBe("2027-08-05");
    expect(copy.bourse.window_closes).toBe("2029-02-28"); // 29 février → 28
    expect(copy.bourse.window_confirmed).toBe(false);
    expect(copy.bourse.published).toBe(false);
    expect(copy.bourse.verified_by_kpb).toBe(false);
    expect(copy.requirements[0]).not.toHaveProperty("id");
    expect(copy.requirements[0]!.bourse_id).toBe("chevening-2028");
  });

  test("identifiant de la copie", () => {
    expect(duplicateId("um6p", 2028)).toBe("um6p-2028");
    expect(duplicateId("um6p-2027", 2028)).toBe("um6p-2028");
  });

  test("export bourses.json : publiées seulement, exigences triées", () => {
    const draft = { ...bourse, id: "brouillon", published: false };
    const out = toBoursesJson(
      [bourse, draft],
      [req("r2", 2), req("r1", 1), req("x", 1, "brouillon")],
      NOW,
    );
    expect(out.version).toBe(1);
    expect(out.count).toBe(1);
    const entry = out.bourses[0]!;
    expect(entry["id"]).toBe("chevening-2026");
    expect((entry["requirements"] as { label: string }[]).map((r) => r.label)).toEqual([
      "Essai 1",
      "Essai 2",
    ]);
    expect(entry).not.toHaveProperty("published");
    expect(JSON.parse(JSON.stringify(out)).generated_at).toBe(NOW.toISOString());
  });

  test("validation : JSON des critères et des tests d'anglais", () => {
    const { updated_at: _u, ...input } = bourse;
    expect(bourseSchema.safeParse(input).success).toBe(true);
    expect(
      bourseSchema.safeParse({ ...input, english_tests: [{ test: "cambridge", min_score: 1 }] })
        .success,
    ).toBe(false);
    expect(bourseSchema.safeParse({ ...input, id: "Avec Espaces" }).success).toBe(false);
  });
});

describe("diffusion", () => {
  const member: SegmentMember = {
    id: "m",
    nationality: "NE",
    residence: "SN",
    status: "active",
    bourseIds: ["chevening-2026"],
    deletionRequested: false,
  };

  test("segments", () => {
    expect(matchesSegment(member, { bourseId: null, status: "all", country: null })).toBe(true);
    expect(matchesSegment(member, { bourseId: null, status: "free", country: null })).toBe(false);
    expect(matchesSegment(member, { bourseId: null, status: "active", country: "SN" })).toBe(true);
    expect(matchesSegment(member, { bourseId: null, status: "active", country: "CI" })).toBe(false);
    expect(matchesSegment(member, { bourseId: "um6p", status: "all", country: null })).toBe(false);
    expect(
      matchesSegment(
        { ...member, deletionRequested: true },
        { bourseId: null, status: "all", country: null },
      ),
    ).toBe(false);
  });

  test("statut d'abonnement", () => {
    expect(memberStatus(null, NOW)).toBe("free");
    expect(memberStatus(at(2), NOW)).toBe("active");
    expect(memberStatus(at(-2), NOW)).toBe("expired");
  });

  test("une annonce respecte la préférence « nouveaux contenus »", () => {
    const prefs: Prefs = {
      email: "a@b.c",
      phone_e164: "+22790000000",
      phone_verified_at: "2026-01-01",
      email_optin: true,
      notif_email: true,
      whatsapp_optin: true,
      notif_whatsapp_alerts: true,
      notif_whatsapp_reminders: true,
      notif_whatsapp_content: false,
    };
    expect(categoryOf("content_broadcast")).toBe("content");
    expect(channelsFor("content_broadcast", prefs)).toEqual({ email: true, whatsapp: false });
    // Sans accord email ni WhatsApp contenus : une annonce n'est pas un rappel, rien ne part
    expect(channelsFor("content_broadcast", { ...prefs, notif_email: false })).toEqual({
      email: false,
      whatsapp: false,
    });
  });
});

describe("vie privée", () => {
  test("suppression effective après 7 jours", () => {
    const requested = "2026-10-01T10:00:00Z";
    expect(deletionDueAt(requested).toISOString()).toBe("2026-10-08T10:00:00.000Z");
    expect(isDeletionDue(requested, new Date("2026-10-08T09:59:00Z"))).toBe(false);
    expect(isDeletionDue(requested, new Date("2026-10-08T10:00:00Z"))).toBe(true);
    expect(isDeletionDue(null, NOW)).toBe(false);
  });

  test("consentement à redemander quand la version change", () => {
    expect(needsConsent({ consent_at: null, consent_version: null })).toBe(true);
    expect(needsConsent({ consent_at: "2026-01-01", consent_version: "2025-01" })).toBe(true);
    expect(needsConsent({ consent_at: "2026-01-01", consent_version: CONSENT_VERSION })).toBe(
      false,
    );
  });
});

describe("en-têtes de sécurité", () => {
  test("CSP", () => {
    const csp = buildCsp({ supabaseUrl: "https://abc.supabase.co/rest/v1" });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
    expect(csp).toContain("frame-ancestors 'self' https://lovable.dev");
    expect(csp).not.toContain("unsafe-eval");
    expect(buildCsp()).toContain("https://*.supabase.co");
  });

  test("ajoutés sans écraser, CSP seulement sur le HTML", async () => {
    const html = withSecurityHeaders(
      new Response("<p>ok</p>", { headers: { "content-type": "text/html" } }),
    );
    expect(html.headers.get("content-security-policy")).toContain("default-src");
    expect(html.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await html.text()).toBe("<p>ok</p>");

    const json = withSecurityHeaders(
      new Response("{}", {
        status: 201,
        headers: { "content-type": "application/json", "referrer-policy": "no-referrer" },
      }),
    );
    expect(json.status).toBe(201);
    expect(json.headers.get("content-security-policy")).toBeNull();
    expect(json.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
