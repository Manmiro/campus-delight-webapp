import { describe, expect, it } from "vitest";
import { orderPaymentOptions, tokensForKobo } from "@/lib/prd-rules";

const base = { mealsLeftToday: 0, walletBalanceKobo: 0, availableCreditKobo: 0, isVerified: false, accountAgeHours: 0 };

describe("token payments use 1 token = ₦1", () => {
  it("a ₦200 order needs 200 tokens", () => {
    expect(tokensForKobo(20000)).toBe(200);
  });
  it("1,018 tokens can pay a ₦200 order", () => {
    expect(orderPaymentOptions({ ...base, tokenBalance: 1018, totalKobo: 20000 }).tokens).toBe(true);
  });
  it("199 tokens cannot pay a ₦200 order", () => {
    expect(orderPaymentOptions({ ...base, tokenBalance: 199, totalKobo: 20000 }).tokens).toBe(false);
  });
});
