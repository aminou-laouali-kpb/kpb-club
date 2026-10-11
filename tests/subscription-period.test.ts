import { describe, expect, test } from "bun:test";
import { computeExtension } from "../src/lib/subscription-period";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 9);

describe("prolongation d'accès", () => {
  test("sans abonnement : départ maintenant", () => {
    const { endsAt, graceEndsAt } = computeExtension(null, 30, now);
    expect(endsAt.getTime()).toBe(now + 30 * DAY);
    expect(graceEndsAt.getTime()).toBe(now + 33 * DAY);
  });

  test("abonnement en cours : on prolonge depuis sa fin", () => {
    const current = new Date(now + 10 * DAY).toISOString();
    expect(computeExtension(current, 90, now).endsAt.getTime()).toBe(now + 100 * DAY);
  });

  test("abonnement expiré : départ maintenant", () => {
    const current = new Date(now - 5 * DAY).toISOString();
    expect(computeExtension(current, 30, now).endsAt.getTime()).toBe(now + 30 * DAY);
  });
});
