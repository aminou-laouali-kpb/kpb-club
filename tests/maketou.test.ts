import { describe, expect, test } from "bun:test";
import { normalizeStatus, parseCart } from "../src/lib/maketou.server";

describe("lecture des réponses Maketou", () => {
  test("panier à plat", () => {
    const cart = parseCart({
      id: "cart_1",
      status: "completed",
      amount: 30000,
      meta: { paymentId: "11111111-1111-1111-1111-111111111111" },
    });
    expect(cart).toEqual({
      externalId: "cart_1",
      status: "paid",
      amount: 30000,
      paymentId: "11111111-1111-1111-1111-111111111111",
      transactionRef: null,
    });
  });

  test("payload de webhook enveloppé", () => {
    const cart = parseCart({
      event: "cart.completed",
      data: { cart: { _id: "c2", status: "PAID", total: "15000", metadata: { paymentId: "p" } } },
    });
    expect(cart.externalId).toBe("c2");
    expect(cart.status).toBe("paid");
    expect(cart.amount).toBe(15000);
    expect(cart.paymentId).toBe("p");
  });

  test("statuts", () => {
    expect(normalizeStatus("waiting_payment")).toBe("pending");
    expect(normalizeStatus("cancelled")).toBe("failed");
    expect(normalizeStatus(null)).toBe("pending");
  });
});
