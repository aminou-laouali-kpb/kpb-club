/**
 * Adaptateur Maketou (https://docs-api.maketou.com).
 *
 * Tout ce qui dépend du format de l'API Maketou est isolé ici : chemins des endpoints,
 * champs envoyés, lecture des réponses et du webhook. Les chemins sont surchargeables
 * par variables d'environnement pour s'aligner sur la documentation sans toucher au code.
 */
import type { ClubPlan } from "./pricing";

const BASE_URL = () => process.env["MAKETOU_BASE_URL"] ?? "https://api.maketou.net";
const CHECKOUT_PATH = () => process.env["MAKETOU_CHECKOUT_PATH"] ?? "/api/v1/stores/cart/checkout";
/** `{id}` est remplacé par l'identifiant du panier. */
const CART_PATH = () => process.env["MAKETOU_CART_PATH"] ?? "/api/v1/stores/cart/{id}";

export type CheckoutStatus = "paid" | "pending" | "failed";

export function productIdForPlan(plan: ClubPlan): string {
  const key =
    plan === "monthly" ? "MAKETOU_PRODUCT_CLUB_MONTHLY" : "MAKETOU_PRODUCT_CLUB_QUARTERLY";
  const id = process.env[key];
  if (!id) throw new Error(`Configuration manquante : ${key}`);
  return id;
}

function apiKey(): string {
  const key = process.env["MAKETOU_API_KEY"];
  if (!key) throw new Error("Configuration manquante : MAKETOU_API_KEY");
  return key;
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`Maketou HTTP ${res.status}: ${text.slice(0, 300)}`);
  return body;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Cherche la première valeur texte présente parmi plusieurs chemins possibles (`a.b.c`). */
function pick(source: unknown, paths: string[]): string | null {
  for (const path of paths) {
    let cur: unknown = source;
    for (const key of path.split(".")) cur = isObj(cur) ? cur[key] : undefined;
    if (typeof cur === "string" && cur) return cur;
    if (typeof cur === "number") return String(cur);
  }
  return null;
}

function pickNumber(source: unknown, paths: string[]): number | null {
  const v = pick(source, paths);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Traduit les statuts Maketou (libellés variables) en statut interne. */
export function normalizeStatus(raw: string | null): CheckoutStatus {
  const s = (raw ?? "").toLowerCase();
  if (["completed", "paid", "success", "succeeded", "successful", "complete"].includes(s))
    return "paid";
  if (["failed", "cancelled", "canceled", "expired", "abandoned", "refused"].includes(s))
    return "failed";
  return "pending";
}

export type CartInfo = {
  externalId: string | null;
  status: CheckoutStatus;
  amount: number | null;
  paymentId: string | null;
  transactionRef: string | null;
};

/** Lit un panier ou un payload de webhook Maketou, quelle que soit son enveloppe. */
export function parseCart(body: unknown): CartInfo {
  const roots = [
    body,
    ...["data", "cart", "data.cart", "payload", "order"].map((p) =>
      p.split(".").reduce<unknown>((cur, k) => (isObj(cur) ? cur[k] : undefined), body),
    ),
  ].filter(isObj);
  const first = (paths: string[]) => {
    for (const r of roots) {
      const v = pick(r, paths);
      if (v) return v;
    }
    return null;
  };
  const amount =
    roots
      .map((r) => pickNumber(r, ["amount", "total", "totalAmount", "price"]))
      .find((n) => n !== null) ?? null;
  return {
    externalId: first(["id", "_id", "cartId", "documentId"]),
    status: normalizeStatus(first(["status", "paymentStatus", "state"])),
    amount,
    paymentId: first([
      "meta.paymentId",
      "metadata.paymentId",
      "meta.payment_id",
      "metadata.payment_id",
    ]),
    transactionRef: first([
      "transactionId",
      "transaction_id",
      "payment.id",
      "reference",
      "paymentReference",
    ]),
  };
}

export async function createCheckout(input: {
  plan: ClubPlan;
  paymentId: string;
  customer: { name: string; email: string | null; phone: string | null };
  returnUrl: string;
}) {
  const [firstName, ...rest] = input.customer.name.trim().split(/\s+/);
  const body = await call(CHECKOUT_PATH(), {
    method: "POST",
    body: JSON.stringify({
      productDocumentId: productIdForPlan(input.plan),
      email: input.customer.email ?? undefined,
      firstName: firstName || undefined,
      lastName: rest.join(" ") || undefined,
      phone: input.customer.phone ?? undefined,
      redirectURL: input.returnUrl,
      meta: { paymentId: input.paymentId, plan: input.plan },
    }),
  });
  const checkoutUrl = pick(body, [
    "redirectUrl",
    "redirectURL",
    "checkoutUrl",
    "paymentUrl",
    "url",
    "data.redirectUrl",
    "data.checkoutUrl",
    "data.url",
  ]);
  if (!checkoutUrl) throw new Error("Maketou : URL de paiement absente de la réponse");
  return { externalId: parseCart(body).externalId, checkoutUrl };
}

export async function getCart(externalId: string): Promise<CartInfo> {
  const body = await call(CART_PATH().replace("{id}", encodeURIComponent(externalId)));
  return parseCart(body);
}

/**
 * Le webhook est configuré chez Maketou avec `?token=<MAKETOU_WEBHOOK_SECRET>`.
 * C'est une protection d'appoint : chaque webhook est de toute façon re-vérifié
 * auprès de l'API avant toute activation.
 */
export async function verifyWebhookToken(request: Request): Promise<boolean> {
  const secret = process.env["MAKETOU_WEBHOOK_SECRET"];
  if (!secret) return true;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(digest(token), digest(secret));
}
