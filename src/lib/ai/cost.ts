/** Estimation du coût des appels (dollars US), pour le suivi dans l'admin. */

type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** Prix par million de jetons (à revoir sur la page officielle des tarifs). */
export const PRICES: Record<string, Price> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function estimateCost(model: string, usage: Usage): number {
  const price = PRICES[model] ?? PRICES["claude-sonnet-5-5"]!;
  const cost =
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite) /
    1_000_000;
  return Math.round(cost * 100_000) / 100_000;
}
