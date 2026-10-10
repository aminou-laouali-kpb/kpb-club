import { afterEach, describe, expect, test } from "bun:test";
import Anthropic from "@anthropic-ai/sdk";
import { QUOTAS, isLifetimeQuota, monthStart, quotaFor, remaining } from "../src/lib/ai/quotas";
import { anonymize, detectWritingRequest, isIdentityDocument } from "../src/lib/ai/guard";
import { estimateCost } from "../src/lib/ai/cost";
import { EssayReview } from "../src/lib/ai/schemas";
import { AiError, runStructured, setClientForTests } from "../src/lib/ai/client.server";

describe("quotas", () => {
  test("niveaux de la spec §12.4", () => {
    expect(QUOTAS.free).toEqual({ essay_review: 1, cv_review: 0, interview_sim: 0, coach_chat: 0 });
    expect(quotaFor("club", "essay_review")).toBe(10);
    expect(quotaFor("accompaniment", "coach_chat")).toBe(300);
    expect(isLifetimeQuota("free", "essay_review")).toBe(true);
    expect(isLifetimeQuota("club", "essay_review")).toBe(false);
    expect(remaining(3, 5)).toBe(0);
  });
  test("début de mois dans le fuseau du membre", () => {
    // 1er novembre 00 h 30 à Paris (UTC+1) = encore octobre en UTC
    const now = new Date("2026-10-31T23:30:00Z");
    expect(monthStart(now, "Europe/Paris").toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(monthStart(now, "Africa/Niamey").toISOString()).toBe("2026-10-31T23:00:00.000Z");
    // À Dakar (UTC+0), c'est encore octobre
    expect(monthStart(now, "Africa/Dakar").toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(monthStart(new Date("2026-10-10T12:00:00Z"), "Africa/Dakar").toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });
});

describe("garde-fous", () => {
  test("demandes de rédaction détectées", () => {
    for (const t of [
      "Écris-moi un essai sur mon projet",
      "ecris moi ma lettre de motivation",
      "Peux-tu écrire mon introduction ?",
      "Rédige mon CV",
      "Reformule ce paragraphe",
      "Can you write my personal statement?",
      "Please rewrite the essay for me",
      "fais-moi une lettre de motivation",
    ]) {
      expect(detectWritingRequest(t)).toBe(true);
    }
  });
  test("pas de faux positif sur une vraie question", () => {
    for (const t of [
      "J'ai écrit mon essai, que faut-il améliorer ?",
      "Quels documents pour Sciences Po ?",
      "Comment structurer une lettre de motivation ?",
      "My essay describes my community work",
    ]) {
      expect(detectWritingRequest(t)).toBe(false);
    }
  });
  test("anonymisation", () => {
    const out = anonymize(
      "Je suis Awa Diallo, écris à awa.d@mail.com ou au +227 90 12 34 56. Awa aime les maths.",
      {
        full_name: "Awa Diallo",
        email: "awa.d@mail.com",
        phone: "+227 90 12 34 56",
      },
    );
    expect(out).not.toContain("Awa");
    expect(out).not.toContain("Diallo");
    expect(out).not.toContain("mail.com");
    expect(out).not.toContain("90 12");
    expect(out).toContain("[nom]");
  });
  test("pièces d'identité exclues", () => {
    expect(isIdentityDocument("passport")).toBe(true);
    expect(isIdentityDocument("id_card")).toBe(true);
    expect(isIdentityDocument("transcript")).toBe(false);
    expect(isIdentityDocument(null)).toBe(false);
  });
});

describe("coûts", () => {
  test("Sonnet 5.5 avec cache", () => {
    const cost = estimateCost("claude-sonnet-5-5", {
      input_tokens: 1_000,
      output_tokens: 800,
      cache_read_input_tokens: 2_000,
    });
    expect(cost).toBeCloseTo(0.0104, 4);
  });
});

const validReview = {
  refusal: null,
  overall_score: 54,
  verdict: "Bonne base, impact peu démontré.",
  criteria: [{ name: "Impact communautaire", score: 3, justification: "Peu d'exemples." }],
  strengths: [{ point: "Projet clair", quote: "je veux devenir ingénieure" }],
  gaps: [
    { criterion: "Impact communautaire", issue: "Aucune action passée", quote: "aider mon pays" },
  ],
  questions_to_ask: ["Qu'as-tu déjà fait pour ta communauté ?"],
  generic_signals: [],
  length: { words: 420, max_words: 600, ok: true },
  language: { expected: "fr", detected: "fr", ok: true },
};

function fakeClient(responses: Array<unknown>) {
  const calls: unknown[] = [];
  return {
    calls,
    client: {
      beta: {
        messages: {
          parse: async (params: unknown) => {
            calls.push(params);
            const next = responses.shift();
            if (next instanceof Error) throw next;
            return next;
          },
        },
      },
    },
  };
}

const message = (parsed: unknown, stop = "end_turn") => ({
  model: "claude-sonnet-5-5",
  stop_reason: stop,
  parsed_output: parsed,
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0 },
});

const call = () =>
  runStructured({
    model: "claude-sonnet-5-5",
    system: "s",
    cached: "c",
    content: "essai",
    schema: EssayReview,
    effort: "medium",
  });

describe("sortie structurée", () => {
  afterEach(() => setClientForTests(null));

  test("réponse valide du premier coup, paramètres attendus", async () => {
    const fake = fakeClient([message(validReview)]);
    setClientForTests(fake.client);
    const result = await call();
    expect(result.data.overall_score).toBe(54);
    const params = fake.calls[0] as Record<string, unknown>;
    expect(params["fallbacks"]).toBe("default");
    expect(params["betas"]).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params["temperature"]).toBeUndefined();
    expect((params["output_config"] as { effort: string }).effort).toBe("medium");
    const system = params["system"] as { cache_control?: unknown }[];
    expect(system.at(-1)?.cache_control).toEqual({ type: "ephemeral" });
  });

  test("JSON invalide : un seul nouvel essai, qui réussit", async () => {
    const fake = fakeClient([
      new Anthropic.AnthropicError("Failed to parse structured output"),
      message(validReview),
    ]);
    setClientForTests(fake.client);
    const result = await call();
    expect(result.data.verdict).toContain("Bonne base");
    expect(fake.calls).toHaveLength(2);
    const retry = fake.calls[1] as { messages: { role: string }[] };
    expect(retry.messages.at(-1)?.role).toBe("system");
  });

  test("deux échecs : erreur propre, pas de troisième appel", async () => {
    const fake = fakeClient([message({ overall_score: "?" }), message(null, "max_tokens")]);
    setClientForTests(fake.client);
    await expect(call()).rejects.toMatchObject({ kind: "invalid_output" });
    expect(fake.calls).toHaveLength(2);
  });

  test("refus du modèle", async () => {
    const fake = fakeClient([message(null, "refusal")]);
    setClientForTests(fake.client);
    const error = await call().catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.kind).toBe("refused");
  });
});
