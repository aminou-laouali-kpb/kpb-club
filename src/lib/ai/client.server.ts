/**
 * Client du coach IA (Claude API, SDK officiel).
 * - Sorties structurées validées par Zod, avec un seul nouvel essai si le JSON est invalide.
 * - Repli serveur en cas de refus (`fallbacks: "default"`) sur Claude Sonnet 5.5.
 * - Prompt système et critères mis en cache (préfixe stable).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { estimateCost } from "./cost";

export const MODEL_STRONG = () => process.env["AI_MODEL_STRONG"] ?? "claude-sonnet-5-5";
export const MODEL_FAST = () => process.env["AI_MODEL_FAST"] ?? "claude-haiku-5-5";

/** Le repli serveur sur refus n'existe que pour les modèles qui le prennent en charge. */
const FALLBACK_MODELS = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

/** Tests uniquement : remplace le client par un double. */
export function setClientForTests(fake: unknown) {
  client = fake as Anthropic | null;
}

function getClient() {
  if (!client) {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new AiError("unavailable", "Le coach IA n'est pas encore configuré.");
    client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
  }
  return client;
}

export type AiErrorKind =
  "unavailable" | "rate_limited" | "refused" | "invalid_output" | "too_long";

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Traduit les erreurs du SDK en messages affichables, sans exposer de détail technique. */
export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError("rate_limited", "Le coach est très sollicité. Réessaie dans une minute.");
  }
  if (error instanceof Anthropic.APIError) {
    console.error("Claude API", error.status, error.message);
    return new AiError(
      "unavailable",
      "Le coach est momentanément indisponible. Réessaie plus tard.",
    );
  }
  console.error("Claude API", error);
  return new AiError("unavailable", "Connexion au coach impossible. Réessaie plus tard.");
}

export type CallUsage = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_usd: number;
};

function usageOf(model: string, usage: Anthropic.Beta.BetaUsage): CallUsage {
  return {
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cached_tokens: usage.cache_read_input_tokens ?? 0,
    cost_usd: estimateCost(model, usage),
  };
}

function addUsage(a: CallUsage | null, b: CallUsage): CallUsage {
  if (!a) return b;
  return {
    model: b.model,
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cached_tokens: a.cached_tokens + b.cached_tokens,
    cost_usd: Math.round((a.cost_usd + b.cost_usd) * 100_000) / 100_000,
  };
}

/** Blocs système : le prompt figé puis, s'il y a lieu, un bloc stable (critères) — tous deux en cache. */
function systemBlocks(system: string, cached?: string): Anthropic.Beta.BetaTextBlockParam[] {
  const blocks: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: system }];
  if (cached) blocks.push({ type: "text", text: cached });
  blocks[blocks.length - 1]!.cache_control = { type: "ephemeral" };
  return blocks;
}

function fallbackParams(model: string) {
  return FALLBACK_MODELS.has(model)
    ? { betas: [FALLBACK_BETA], fallbacks: "default" as const }
    : {};
}

/**
 * Appel à sortie structurée. Un JSON invalide ou tronqué déclenche un seul nouvel essai,
 * puis une erreur `invalid_output` (le quota n'est alors pas décompté par l'appelant).
 */
export async function runStructured<S extends z.ZodType>(opts: {
  model: string;
  system: string;
  cached?: string;
  content: Anthropic.Beta.BetaContentBlockParam[] | string;
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; usage: CallUsage; servedBy: string }> {
  const api = getClient();
  let usage: CallUsage | null = null;
  let lastProblem = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.content }];
    if (attempt === 1 && lastProblem) {
      // Nouvel essai : on signale le problème dans un message système, sans toucher à l'historique
      messages.push({
        role: "system",
        content: `Ta réponse précédente n'a pas pu être lue (${lastProblem}). Réponds uniquement avec un JSON conforme au format demandé.`,
      });
    }
    let response;
    try {
      response = await api.beta.messages.parse({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 16_000,
        system: systemBlocks(opts.system, opts.cached),
        messages,
        output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
        ...fallbackParams(opts.model),
      });
    } catch (error) {
      // JSON illisible (AnthropicError du parseur) : on retente une fois ; les erreurs d'API remontent
      if (error instanceof Anthropic.APIError || !(error instanceof Anthropic.AnthropicError)) {
        throw toAiError(error);
      }
      lastProblem = "format invalide";
      continue;
    }
    usage = addUsage(usage, usageOf(response.model, response.usage));

    if (response.stop_reason === "refusal") {
      throw new AiError(
        "refused",
        "Le coach ne peut pas traiter cette demande. Reformule ou contacte l'équipe KPB.",
      );
    }
    if (response.stop_reason === "max_tokens") {
      lastProblem = "réponse tronquée";
      continue;
    }
    const parsed = opts.schema.safeParse(response.parsed_output);
    if (parsed.success) return { data: parsed.data, usage, servedBy: response.model };
    lastProblem = "champs manquants ou invalides";
  }
  throw new AiError(
    "invalid_output",
    "Le coach n'a pas pu produire une analyse lisible. Réessaie : cette tentative n'est pas décomptée.",
  );
}

/**
 * Réponse texte en flux (chat, feedback d'entretien). `onText` reçoit chaque morceau ;
 * la fonction renvoie le texte complet et la consommation.
 */
export async function streamText(opts: {
  model: string;
  system: string;
  cached?: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  effort: "low" | "medium" | "high";
  maxTokens?: number;
  onText: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<{ text: string; usage: CallUsage; refused: boolean }> {
  const api = getClient();
  try {
    const stream = api.beta.messages.stream(
      {
        model: opts.model,
        max_tokens: opts.maxTokens ?? 4_000,
        system: systemBlocks(opts.system, opts.cached),
        messages: opts.messages,
        output_config: { effort: opts.effort },
        ...fallbackParams(opts.model),
      },
      { signal: opts.signal },
    );
    let text = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        opts.onText(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    return {
      text,
      usage: usageOf(final.model, final.usage),
      refused: final.stop_reason === "refusal",
    };
  } catch (error) {
    throw toAiError(error);
  }
}
