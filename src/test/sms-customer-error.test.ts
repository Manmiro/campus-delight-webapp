import { describe, expect, it } from "vitest";
import { customerSmsError } from "@/lib/credit.functions";

describe("customer SMS failure messages", () => {
  it("explains a provider monthly limit without exposing provider details", () => {
    const msg = customerSmsError(new Error('SMS provider failed [402]: {"code":"usage_limit_reached"}'));
    expect(msg).toBe("Verification texts are paused for now. Please try again later.");
  });
  it("keeps phone format guidance", () => {
    expect(customerSmsError(new Error("Enter a valid phone number in your profile, such as 0803 000 0000"))).toContain("Enter a valid phone number");
  });
  it("hides other provider errors", () => {
    expect(customerSmsError(new Error("SMS provider failed [500]: internal"))).not.toContain("500");
  });
});
