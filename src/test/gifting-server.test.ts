// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  rpc: vi.fn(),
  initialize: vi.fn(),
  verify: vi.fn(),
  email: vi.fn(),
  sign: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        gt: () => q,
        order: () => q,
        maybeSingle: async () => ({ data: mocks.rows[table], error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: mocks.rows[table], error: null }).then(resolve),
      };
      return q;
    },
    rpc: mocks.rpc,
    storage: { from: () => ({ createSignedUrl: mocks.sign }) },
  },
}));
vi.mock("@/lib/payments.server", () => ({
  paystackInitialize: mocks.initialize,
  paystackVerify: mocks.verify,
}));
vi.mock("@/lib/gifting-emails.server", () => ({ emailGift: mocks.email }));
import { giftOrigin, lookupRecipient, settleGift, startGift } from "@/lib/gifting.server";
const reference = "CDG-00000000-0000-0000-0000-000000000005";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TURNSTILE_SECRET_KEY", "test-captcha-secret");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "test-payment-secret");
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, action: "gift", hostname: "campusdelight.net" }),
  });
  mocks.rows = {
    gift_payments: {
      amount_kobo: 200000,
      status: "pending",
      kind: "wallet",
      wallet_fallback: false,
    },
  };
  mocks.rpc.mockResolvedValue({
    data: { applied: true, status: "success", kind: "wallet" },
    error: null,
  });
  mocks.verify.mockResolvedValue({ reference, amount: 200000, currency: "NGN", status: "success" });
  mocks.email.mockResolvedValue(undefined);
});
describe("public gift server boundary", () => {
  it("verifies Paystack before service-only settlement and emails only committed gifts", async () => {
    expect(await settleGift(reference)).toMatchObject({ applied: true, emailStatus: "sent" });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "settle_verified_gift",
      expect.objectContaining({ p_reference: reference, p_amount_kobo: 200000, p_currency: "NGN" }),
    );
    expect(mocks.verify.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.rpc.mock.invocationCallOrder[0]!,
    );
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.email.mock.invocationCallOrder[0]!,
    );
  });
  it("never settles or emails when a successful verification has a mismatched amount", async () => {
    mocks.verify.mockResolvedValue({ reference, amount: 1, currency: "NGN", status: "success" });
    expect(await settleGift(reference)).toEqual({
      applied: false,
      status: "verification_mismatch",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it("keeps a committed gift successful during email failure, while signed webhooks request a retry", async () => {
    mocks.email.mockRejectedValue(new Error("Provider unavailable"));
    expect(await settleGift(reference)).toMatchObject({
      applied: true,
      emailStatus: "unavailable",
    });
    await expect(settleGift(reference, true)).rejects.toThrow(
      "Gift settled; confirmation email needs retry",
    );
  });
  it("does not repeat settlement or Paystack verification for an already committed gift", async () => {
    mocks.rows["gift_payments"] = {
      amount_kobo: 200000,
      status: "success",
      kind: "plan",
      wallet_fallback: true,
    };
    expect(await settleGift(reference)).toMatchObject({
      applied: true,
      already: true,
      kind: "plan",
      walletFallback: true,
    });
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.email).toHaveBeenCalledWith(reference);
  });
  it("does not disclose full names, contacts, ids or balances in recipient lookup", async () => {
    mocks.rows = {
      profiles: {
        id: "student-id",
        full_name: "Chioma Eze",
        gender: "female",
        avatar_url: "student-id/avatar.jpg",
        outlet_id: "outlet-id",
        email: "private@example.com",
        phone: "private",
      },
      user_roles: { user_id: "student-id" },
      outlets: { id: "outlet-id", name: "Campus kitchen", delivery_fee_kobo: 60000 },
      outlet_plan_prices: [],
      menu_items: [],
    };
    mocks.sign.mockResolvedValue({ data: { signedUrl: "https://images.example/avatar" } });
    const found = await lookupRecipient("CD050619", "captcha");
    expect(found).toEqual({
      foodieId: "CD050619",
      name: "Chioma E.",
      gender: "female",
      avatarUrl: "https://images.example/avatar",
      outlet: { id: "outlet-id", name: "Campus kitchen", deliveryFeeKobo: 60000 },
      prices: [],
      menu: [],
    });
    expect(JSON.stringify(found)).not.toContain("private");
  });
  it("rejects invalid CAPTCHA actions and untrusted hostnames before accessing recipients", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, action: "auth", hostname: "campusdelight.net" }),
    });
    await expect(lookupRecipient("CD050619", "captcha")).rejects.toThrow(
      "Security verification expired",
    );
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, action: "gift", hostname: "attacker.example" }),
    });
    await expect(lookupRecipient("CD050619", "captcha")).rejects.toThrow(
      "Invalid payment return address",
    );
  });
  it("uses the database quote and the sponsor receipt email for checkout", async () => {
    mocks.rpc.mockResolvedValue({ data: 200000, error: null });
    mocks.initialize.mockResolvedValue("https://checkout.paystack.com/test");
    const result = await startGift({
      foodieId: "CD050619",
      outletId: "outlet-id",
      kind: "wallet",
      expectedAmountKobo: 200000,
      sponsorName: "Mum",
      sponsorEmail: "mum@example.com",
      note: "",
      fulfillment: "pickup",
      address: "",
      origin: "https://campusdelight.net",
      captchaToken: "captcha",
    });
    expect(mocks.initialize).toHaveBeenCalledWith({
      email: "mum@example.com",
      amountKobo: 200000,
      reference: result.reference,
      callbackUrl: `https://campusdelight.net/feed-someone?reference=${result.reference}`,
    });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("captcha");
  });
  it("rejects external return origins", () => {
    expect(() => giftOrigin("https://campusdelight.net.attacker.example")).toThrow();
    expect(giftOrigin("https://campusdelight.net/anything")).toBe("https://campusdelight.net");
  });
});
