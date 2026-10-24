import { describe, expect, it } from "vitest";
import { hasConfirmedEmail, validateSignInCredentials } from "@/lib/auth-rules";

describe("Customer email verification and sign-in", () => {
  it("requires an email address to sign in", () => {
    expect(() => validateSignInCredentials("", "test-password")).toThrow("Enter your email address");
  });
  it("requires a password to sign in", () => {
    expect(() => validateSignInCredentials("customer@example.com", "")).toThrow("Enter your password");
  });
  it("does not allow an unconfirmed customer into the dashboard", () => {
    expect(hasConfirmedEmail({ email_confirmed_at: null })).toBe(false);
  });
  it("allows a customer whose email has been confirmed", () => {
    expect(hasConfirmedEmail({ email_confirmed_at: "2026-10-24T19:28:00Z" })).toBe(true);
  });
});