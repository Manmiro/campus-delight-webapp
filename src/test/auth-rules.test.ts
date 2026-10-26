import { describe, expect, it } from "vitest";
import { hasConfirmedEmail, validateSignInCredentials, validateSignInForm, validateSignUpForm } from "@/lib/auth-rules";

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
  it("asks for the email and password separately when signing in", () => {
    expect(validateSignInForm("", "")).toEqual({ email: "Enter your email address", password: "Enter your password" });
  });
});

const completeSignUp = {
  fullName: "Ada Obi",
  email: "ada.obi@ebsonu.edu.ng",
  phone: "08030000000",
  gender: "female",
  dateOfBirth: "2004-05-12",
  outletId: "5b9e7af9-16ed-47b8-8d2f-e7ac8c2362b3",
  password: "sunset-garden",
  referralCode: "",
  acceptedTerms: true,
};

describe("Customer sign-up form requires every field except the referral code", () => {
  it("accepts a complete sign-up with no referral code", () => {
    expect(validateSignUpForm(completeSignUp)).toEqual({});
  });

  it("still accepts the same sign-up when a referral code is given", () => {
    expect(validateSignUpForm({ ...completeSignUp, referralCode: "CD482901" })).toEqual({});
  });

  it("requires the full name", () => {
    expect(validateSignUpForm({ ...completeSignUp, fullName: "   " })).toEqual({ fullName: "Enter your full name" });
  });

  it("requires a usable email address", () => {
    expect(validateSignUpForm({ ...completeSignUp, email: "" })).toEqual({ email: "Enter your email address" });
    expect(validateSignUpForm({ ...completeSignUp, email: "ada.obi" })).toEqual({
      email: "Enter a valid email address, such as you@example.com",
    });
  });

  it("requires a deliverable phone number", () => {
    expect(validateSignUpForm({ ...completeSignUp, phone: "" })).toEqual({ phone: "Enter your phone number" });
    expect(validateSignUpForm({ ...completeSignUp, phone: "0803" })).toEqual({
      phone: "Enter a valid phone number, such as 0803 000 0000",
    });
  });

  it("requires a gender", () => {
    expect(validateSignUpForm({ ...completeSignUp, gender: "" })).toEqual({ gender: "Select your gender" });
  });

  it("requires a real date of birth", () => {
    expect(validateSignUpForm({ ...completeSignUp, dateOfBirth: "" })).toEqual({ dateOfBirth: "Enter your date of birth" });
    expect(validateSignUpForm({ ...completeSignUp, dateOfBirth: "2999-01-01" })).toEqual({
      dateOfBirth: "Date of birth cannot be in the future",
    });
  });

  it("requires a campus outlet", () => {
    expect(validateSignUpForm({ ...completeSignUp, outletId: "" })).toEqual({
      outletId: "Choose your Campus Delight outlet",
    });
  });

  it("requires a password of at least six characters", () => {
    expect(validateSignUpForm({ ...completeSignUp, password: "" })).toEqual({ password: "Enter a password" });
    expect(validateSignUpForm({ ...completeSignUp, password: "12345" })).toEqual({
      password: "Password must be at least 6 characters",
    });
  });

  it("requires the terms and privacy policy to be accepted", () => {
    expect(validateSignUpForm({ ...completeSignUp, acceptedTerms: false })).toEqual({
      acceptedTerms: "Please accept the Terms and Conditions and Privacy Policy",
    });
  });

  it("never blocks a sign-up because of a missing referral code", () => {
    const errors = validateSignUpForm({ ...completeSignUp, referralCode: "" });
    expect(errors.referralCode).toBeUndefined();
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it("reports every missing field at once so nothing is quietly skipped", () => {
    const errors = validateSignUpForm({
      fullName: "",
      email: "",
      phone: "",
      gender: "",
      dateOfBirth: "",
      outletId: "",
      password: "",
      referralCode: "",
      acceptedTerms: false,
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["acceptedTerms", "dateOfBirth", "email", "fullName", "gender", "outletId", "password", "phone"].sort(),
    );
  });
});
