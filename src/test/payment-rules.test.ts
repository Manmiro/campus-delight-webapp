import { describe, expect, it } from "vitest";
import { paymentInput, verifiedPaymentMatches } from "@/lib/payment-rules";

describe("Paystack checkout rules", () => {
  const origin = "https://campus-delight-webapp.lovable.app";
  it("accepts original wallet funding and subscription checkout", () => {
    expect(paymentInput.safeParse({ purpose: "wallet_funding", amountKobo: 200000, origin }).success).toBe(true);
    expect(paymentInput.safeParse({ purpose: "subscription", relatedId: "5b9e7af9-16ed-47b8-8d2f-e7ac8c2362b3", origin }).success).toBe(true);
  });
  it("rejects fractional, negative and unsafe money amounts", () => {
    for (const amountKobo of [0, -100, 100.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(paymentInput.safeParse({ purpose: "wallet_funding", amountKobo, origin }).success).toBe(false);
  });
  it("rejects new direct card food checkout requests", () => {
    expect(paymentInput.safeParse({ purpose: "order_payment", items: [{ menu_item_id: "5b9e7af9-16ed-47b8-8d2f-e7ac8c2362b3", quantity: 1 }], origin }).success).toBe(false);
  });
  it("applies only exact, successful NGN verification for the expected reference", () => {
    const expected = { reference: "CDPS-TEST", amountKobo: 200000 };
    const actual = { reference: "CDPS-TEST", amount: 200000, currency: "NGN", status: "success" };
    expect(verifiedPaymentMatches(expected, actual)).toBe(true);
    for (const change of [{ amount: 199999 }, { amount: 200001 }, { reference: "OTHER" }, { currency: "USD" }, { status: "pending" }, { status: "failed" }]) expect(verifiedPaymentMatches(expected, { ...actual, ...change })).toBe(false);
  });
});