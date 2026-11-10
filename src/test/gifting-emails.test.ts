// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render } from "@react-email/render";

const fixture = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  send: vi.fn(),
  filters: vi.fn(),
}));
vi.mock("@/lib/gifting.server", () => ({
  giftDb: {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: (field: string, value: unknown) => {
          fixture.filters(table, field, value);
          return q;
        },
        single: async () => ({ data: fixture.rows[table], error: null }),
        maybeSingle: async () => ({ data: fixture.rows[table], error: null }),
      };
      return q;
    },
  },
}));
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: fixture.send }));
import { emailGift } from "@/lib/gifting-emails.server";
import { GiftReceipt } from "@/lib/email-templates/gift-receipt";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.send.mockResolvedValue({ sent: true });
  fixture.rows = {
    gift_payments: {
      reference: "CDG-committed",
      status: "success",
      customer_id: "student-1",
      outlet_id: "outlet-1",
      kind: "wallet",
      amount_kobo: 200000,
      sponsor_name: "Mum",
      sponsor_email: "mum@example.com",
      note: "Good luck ❤️",
      selection: {},
      wallet_fallback: false,
    },
    profiles: { full_name: "Chioma Eze", email: "student@example.com" },
    outlets: { name: "Campus kitchen" },
  };
});
describe("gift confirmation emails", () => {
  it("derives both recipients, amount and note from committed records with independent send claims", async () => {
    await emailGift("CDG-committed");
    expect(fixture.filters).toHaveBeenCalledWith("gift_payments", "status", "success");
    expect(fixture.send).toHaveBeenCalledWith("gift-receipt", "student@example.com", {
      idempotencyKey: "gift:CDG-committed:student",
      templateData: expect.objectContaining({
        audience: "student",
        name: "Chioma",
        sponsorName: "Mum",
        amount: "₦2,000",
        note: "Good luck ❤️",
      }),
    });
    expect(fixture.send).toHaveBeenCalledWith("gift-receipt", "mum@example.com", {
      idempotencyKey: "gift:CDG-committed:sponsor",
      templateData: expect.objectContaining({
        audience: "sponsor",
        recipientName: "Chioma E.",
        reference: "CDG-committed",
      }),
    });
  });
  it("attempts both receipts when one provider send fails and signals webhook retry", async () => {
    fixture.send.mockRejectedValueOnce(new Error("Provider unavailable"));
    await expect(emailGift("CDG-committed")).rejects.toThrow("Provider unavailable");
    expect(fixture.send).toHaveBeenCalledTimes(2);
  });
  it("does not send pending gifts", async () => {
    fixture.rows["gift_payments"] = { status: "pending" };
    await emailGift("CDG-pending");
    expect(fixture.send).not.toHaveBeenCalled();
  });
  it("explains wallet fallback instead of claiming an unavailable meal was delivered", async () => {
    fixture.rows["gift_payments"] = {
      ...(fixture.rows["gift_payments"] as object),
      kind: "meal",
      wallet_fallback: true,
    };
    await emailGift("CDG-committed");
    expect(fixture.send.mock.calls[0]?.[2].templateData).toMatchObject({
      gift: "₦2,000 in wallet funding",
      status: expect.stringContaining("full payment was credited"),
    });
  });
  it("renders personal messages as escaped text in the branded template", async () => {
    const html = await render(
      React.createElement(GiftReceipt, {
        audience: "student",
        name: "Chioma",
        sponsorName: "Mum",
        recipientName: "Chioma E.",
        amount: "₦2,000",
        gift: "wallet funding",
        note: "<script>bad()</script>",
        reference: "CDG-test",
        status: "Wallet credited",
        outlet: "Campus kitchen",
      }),
    );
    expect(html).toContain("Good news! A gift from Mum");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>bad()");
  });
});
