import { describe, expect, it } from "vitest";
import { formatFoodieError } from "@/lib/foodie-errors";

describe("formatFoodieError", () => {
  it("turns wallet failures into a two-line, actionable message", () => {
    expect(
      formatFoodieError(new Error("Insufficient wallet balance"), {
        amountKobo: 200000,
        balanceKobo: 155000,
      }),
    ).toEqual({
      title: "Pocket's a little light for this feast",
      description: "You need ₦450 more. Top up your wallet in one tap, then try again.",
    });
  });

  it("keeps token balances specific without exposing backend wording", () => {
    const copy = formatFoodieError(new Error("Insufficient tokens: need 500, have 240"));
    expect(copy.title).toBe("Not quite enough tokens in your jar");
    expect(copy.description).toContain("You have 240 tokens, but this meal needs 500");
    expect(copy.description).not.toContain("Insufficient tokens");
  });

  it("maps transfer and account errors", () => {
    expect(formatFoodieError({ code: "recipient_not_found" }).title).toBe(
      "Couldn't spot that Delighter",
    );
    expect(formatFoodieError({ code: "email_not_confirmed" }).title).toBe("Check your inbox first");
    expect(formatFoodieError("Enter your email address").title).toBe("Let's get your seat ready");
  });

  it("never returns raw SQL or JSON for an unknown error", () => {
    const copy = formatFoodieError(new Error('{"code":"PGRST116","details":"row not found"}'));
    expect(copy.title).toBe("A small kitchen hiccup");
    expect(copy.description).toContain("Your money is safe");
    expect(copy.description).not.toContain("PGRST116");
  });
});
