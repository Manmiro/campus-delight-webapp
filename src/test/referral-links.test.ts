import { describe, expect, it } from "vitest";
import { CANONICAL_REFERRAL_ORIGIN, referralLinkFor, referralQrImageUrl } from "@/lib/referrals";

describe("canonical referral links", () => {
  it("always uses the production domain, independent of the preview host", () => {
    expect(referralLinkFor("CD482901")).toBe(
      `${CANONICAL_REFERRAL_ORIGIN}/auth?mode=signup&ref=CD482901`,
    );
  });

  it("encodes referral codes safely", () => {
    expect(referralLinkFor(" CD&482901 ")).toBe(
      `${CANONICAL_REFERRAL_ORIGIN}/auth?mode=signup&ref=CD%26482901`,
    );
  });

  it("configures the standard QR renderer for Q-level correction without a payload cap", () => {
    const url = new URL(referralQrImageUrl(`${CANONICAL_REFERRAL_ORIGIN}/auth?mode=signup&ref=CD482901`));
    expect(url.origin + url.pathname).toBe("https://quickchart.io/qr");
    expect(url.searchParams.get("ecLevel")).toBe("Q");
    expect(url.searchParams.get("format")).toBe("svg");
    expect(url.searchParams.get("text")).toBe(
      `${CANONICAL_REFERRAL_ORIGIN}/auth?mode=signup&ref=CD482901`,
    );
  });
});
