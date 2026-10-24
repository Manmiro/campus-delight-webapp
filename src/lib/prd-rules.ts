/**
 * Campus Delight money rules (PRD v1.2) — single source of truth for the numbers
 * the app shows and gates on. The database enforces the same rules; if the two
 * ever disagree, the database wins and this file is wrong.
 */

/** Tokens are a nominal-value currency: 1 token is recorded as ₦1 in the ledger. */
export const TOKEN_NOMINAL_VALUE_KOBO = 1;

/** Every new customer starts with these tokens. */
export const WELCOME_TOKENS = 1000;

/** Tokens paid to a referrer when the invited customer's first order lands. */
export const REFERRAL_REWARD_TOKENS = 100;

/** Charged to the sender on every token transfer, on top of the principal. */
export const TOKEN_TRANSFER_FEE_TOKENS = 10;

/** Maximum principal tokens one customer may send to same-outlet customers per day. */
export const TOKEN_TRANSFER_DAILY_CAP_TOKENS = 500;

/** Starter credit limit for a verified customer: ₦2,100. */
export const DEFAULT_CREDIT_LIMIT_KOBO = 210_000;

/** A credit limit shrinks by this share when a loan is settled after its deadline. */
export const LATE_REPAYMENT_REDUCTION = 0.3;

/** A customer must hold an account this old before Eat Now & Pay Later opens up. */
export const MIN_ACCOUNT_AGE_HOURS_FOR_CREDIT = 24;

/** Pay Later charge by repayment term (days → percent of principal). */
export const LOAN_TERM_CHARGE_PERCENT = { 7: 15, 14: 25, 30: 50 } as const;
export type LoanTermDays = keyof typeof LOAN_TERM_CHARGE_PERCENT;

/** Total repayable in kobo for a principal on a given term (integer math). */
export function loanTotalDueKobo(principalKobo: number, termDays: LoanTermDays): number {
  return principalKobo + Math.round((principalKobo * LOAN_TERM_CHARGE_PERCENT[termDays]) / 100);
}


export type PaymentMethod = "subscription_entitlement" | "cash_wallet" | "tokens" | "food_credit";

/** What the sender actually gives up: the principal plus the flat transfer fee. */
export function transferTotalCostTokens(principalTokens: number): number {
  return principalTokens + TOKEN_TRANSFER_FEE_TOKENS;
}

/** Principal tokens still sendable today, given what has already gone out. */
export function remainingTransferAllowanceToday(sentTodayTokens: number): number {
  return Math.max(0, TOKEN_TRANSFER_DAILY_CAP_TOKENS - sentTodayTokens);
}

export type TransferCheck = { ok: true } | { ok: false; reason: string };

/** Gate for a token transfer: whole tokens, inside the daily cap, fee affordable. */
export function checkTokenTransfer(input: {
  principalTokens: number;
  availableTokens: number;
  sentTodayTokens: number;
}): TransferCheck {
  const { principalTokens, availableTokens, sentTodayTokens } = input;
  if (!Number.isInteger(principalTokens) || principalTokens <= 0) {
    return { ok: false, reason: "Enter a whole number of tokens above zero." };
  }
  const remaining = remainingTransferAllowanceToday(sentTodayTokens);
  if (principalTokens > remaining) {
    return { ok: false, reason: `Only ${remaining} tokens left to send today.` };
  }
  if (transferTotalCostTokens(principalTokens) > availableTokens) {
    return { ok: false, reason: "Not enough tokens to cover the transfer and its fee." };
  }
  return { ok: true };
}

/** Repaying a loan in full before its deadline doubles the credit limit. */
export function creditLimitAfterTimelyRepayment(currentKobo: number): number {
  return currentKobo * 2;
}

/** Settling a loan after its deadline cuts the credit limit by 30%. */
export function creditLimitAfterLateRepayment(currentKobo: number): number {
  return Math.round(currentKobo * (1 - LATE_REPAYMENT_REDUCTION));
}

export type OrderPaymentState = {
  mealsLeftToday: number;
  walletBalanceKobo: number;
  tokenBalance: number;
  totalKobo: number;
  availableCreditKobo: number;
  isVerified: boolean;
  accountAgeHours: number;
};

/** Which payment methods a customer may use for an order of `totalKobo`. */
export function orderPaymentOptions(state: OrderPaymentState): Record<PaymentMethod, boolean> {
  return {
    subscription_entitlement: state.mealsLeftToday > 0,
    cash_wallet: state.walletBalanceKobo >= state.totalKobo,
    tokens: state.tokenBalance >= state.totalKobo,
    food_credit:
      state.isVerified &&
      state.accountAgeHours >= MIN_ACCOUNT_AGE_HOURS_FOR_CREDIT &&
      state.availableCreditKobo >= state.totalKobo,
  };
}

/**
 * One payment method per purchase — cash and tokens are never combined, so a
 * checkout can only ever resolve to a single method.
 */
export function resolvePaymentMethod(
  methods: readonly PaymentMethod[],
): { ok: true; method: PaymentMethod } | { ok: false; error: string } {
  const [only, ...rest] = methods;
  if (!only) return { ok: false, error: "Choose a payment method." };
  if (rest.length > 0) {
    return { ok: false, error: "Only one payment method per purchase — cash and tokens cannot be combined." };
  }
  return { ok: true, method: only };
}
