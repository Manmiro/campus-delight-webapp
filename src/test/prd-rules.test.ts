import { describe, expect, it } from "vitest";
import {
  DEFAULT_CREDIT_LIMIT_KOBO,
  REFERRAL_REWARD_TOKENS,
  TOKEN_NOMINAL_VALUE_KOBO,
  TOKEN_TRANSFER_DAILY_CAP_TOKENS,
  TOKEN_TRANSFER_FEE_TOKENS,
  WELCOME_TOKENS,
  checkTokenTransfer,
  creditLimitAfterLateRepayment,
  creditLimitAfterTimelyRepayment,
  orderPaymentOptions,
  remainingTransferAllowanceToday,
  resolvePaymentMethod,
  transferTotalCostTokens,
  type PaymentMethod,
} from "@/lib/prd-rules";

describe("token rules", () => {
  it("gives every new customer 1,000 welcome tokens worth ₦1 each", () => {
    expect(WELCOME_TOKENS).toBe(1000);
    expect(TOKEN_NOMINAL_VALUE_KOBO).toBe(1);
  });

  it("pays a referrer 100 tokens for a first order", () => {
    expect(REFERRAL_REWARD_TOKENS).toBe(100);
  });

  it("adds the 10-token fee on top of the principal", () => {
    expect(transferTotalCostTokens(200)).toBe(210);
    expect(transferTotalCostTokens(500)).toBe(510);
  });

  it("caps same-outlet transfers at 500 principal tokens a day", () => {
    expect(TOKEN_TRANSFER_DAILY_CAP_TOKENS).toBe(500);
    expect(remainingTransferAllowanceToday(450)).toBe(50);
    expect(remainingTransferAllowanceToday(500)).toBe(0);
    expect(remainingTransferAllowanceToday(600)).toBe(0);
  });

  it("refuses a transfer that would break the daily cap", () => {
    expect(checkTokenTransfer({ principalTokens: 500, availableTokens: 10_000, sentTodayTokens: 0 })).toEqual({ ok: true });
    expect(
      checkTokenTransfer({ principalTokens: 501, availableTokens: 10_000, sentTodayTokens: 0 }).ok,
    ).toBe(false);
    expect(checkTokenTransfer({ principalTokens: 60, availableTokens: 10_000, sentTodayTokens: 450 }).ok).toBe(false);
  });

  it("keeps the sender's balance able to pay principal plus fee", () => {
    expect(checkTokenTransfer({ principalTokens: 500, availableTokens: 500, sentTodayTokens: 0 }).ok).toBe(false);
    expect(checkTokenTransfer({ principalTokens: 490, availableTokens: 500, sentTodayTokens: 0 })).toEqual({ ok: true });
  });

  it("rejects zero, negative and fractional transfers", () => {
    for (const principalTokens of [0, -10, 25.5]) {
      expect(checkTokenTransfer({ principalTokens, availableTokens: 10_000, sentTodayTokens: 0 }).ok).toBe(false);
    }
  });
});

describe("eat now & pay later credit rules", () => {
  it("starts verified customers at a ₦2,100 credit limit", () => {
    expect(DEFAULT_CREDIT_LIMIT_KOBO).toBe(210_000);
  });

  it("doubles the limit after a loan is repaid in full on time", () => {
    expect(creditLimitAfterTimelyRepayment(210_000)).toBe(420_000);
    expect(creditLimitAfterTimelyRepayment(420_000)).toBe(840_000);
  });

  it("cuts the limit by exactly 30% when a loan is settled late", () => {
    expect(creditLimitAfterLateRepayment(210_000)).toBe(147_000);
    expect(creditLimitAfterLateRepayment(1_000_000)).toBe(700_000);
  });
});

describe("checkout payment rules", () => {
  const base = {
    mealsLeftToday: 0,
    walletBalanceKobo: 1_200,
    tokenBalance: 1_200,
    totalKobo: 1_500,
    availableCreditKobo: 210_000,
    isVerified: true,
    accountAgeHours: 48,
  };

  it("blocks wallet and tokens when neither can cover the whole order", () => {
    const options = orderPaymentOptions(base);
    expect(options.cash_wallet).toBe(false);
    expect(options.tokens).toBe(false);
    expect(options.food_credit).toBe(true);
  });

  it("allows a payment method once it covers the whole order", () => {
    const options = orderPaymentOptions({ ...base, walletBalanceKobo: 1_500, tokenBalance: 1_500 });
    expect(options.cash_wallet).toBe(true);
    expect(options.tokens).toBe(true);
  });

  it("needs a subscription meal left today to pay by entitlement", () => {
    expect(orderPaymentOptions({ ...base, mealsLeftToday: 1 }).subscription_entitlement).toBe(true);
    expect(orderPaymentOptions({ ...base, mealsLeftToday: 0 }).subscription_entitlement).toBe(false);
  });

  it("keeps Eat Now & Pay Later shut for the first 24 hours and for unverified customers", () => {
    expect(orderPaymentOptions({ ...base, accountAgeHours: 23 }).food_credit).toBe(false);
    expect(orderPaymentOptions({ ...base, accountAgeHours: 24 }).food_credit).toBe(true);
    expect(orderPaymentOptions({ ...base, isVerified: false }).food_credit).toBe(false);
  });

  it("allows exactly one payment method per purchase", () => {
    expect(resolvePaymentMethod(["cash_wallet"])).toEqual({ ok: true, method: "cash_wallet" });
    expect(resolvePaymentMethod([]).ok).toBe(false);
    const mixed = resolvePaymentMethod(["cash_wallet", "tokens"] as PaymentMethod[]);
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) expect(mixed.error).toMatch(/one payment method/i);
  });
});

import { loanTotalDueKobo } from "@/lib/prd-rules";
describe("Pay Later term charges", () => {
  it("7 days adds 15%: ₦2,100 → ₦2,415", () => expect(loanTotalDueKobo(210_000, 7)).toBe(241_500));
  it("14 days adds 25%: ₦2,100 → ₦2,625", () => expect(loanTotalDueKobo(210_000, 14)).toBe(262_500));
  it("30 days adds 50%: ₦2,100 → ₦3,150", () => expect(loanTotalDueKobo(210_000, 30)).toBe(315_000));
});
