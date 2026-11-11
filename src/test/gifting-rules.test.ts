import { describe, expect, it } from "vitest";
import { foodieIdSchema, giftInputSchema, recipientDisplayName } from "@/lib/gifting-rules";

const input = {
  foodieId: "CD050619",
  outletId: "00000000-0000-0000-0000-000000000001",
  kind: "wallet",
  expectedAmountKobo: 200000,
  sponsorName: "Mum",
  sponsorEmail: "mum@example.com",
  origin: "https://campusdelight.net",
};
describe("public gift rules", () => {
  it("normalizes exact Foodie IDs and abbreviates the recipient name", () => {
    expect(foodieIdSchema.parse(" cd050619 ")).toBe("CD050619");
    expect(foodieIdSchema.safeParse("CD05061").success).toBe(false);
    expect(recipientDisplayName("Chioma Eze")).toBe("Chioma E.");
  });
  it("requires valid contact details, bounded amounts, choices and delivery address", () => {
    expect(giftInputSchema.safeParse(input).success).toBe(true);
    for (const change of [
      { sponsorEmail: "wrong" },
      { sponsorName: " " },
      { expectedAmountKobo: 0 },
      { expectedAmountKobo: 100000001 },
      { kind: "plan" },
      { kind: "meal" },
      { kind: "meal", menuItemId: input.outletId, fulfillment: "delivery" },
      { note: "a".repeat(501) },
    ]) {
      expect(giftInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
    }
  });
});
