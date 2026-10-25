import { describe, expect, it } from "vitest";
import { smsPhone, verificationMessage } from "@/lib/sms-rules";

describe("SMS verification rules", () => {
  it("normalizes Nigerian local numbers", () => {
    expect(smsPhone("0803 000 0000")).toBe("+2348030000000");
    expect(smsPhone("2348030000000")).toBe("+2348030000000");
  });
  it("keeps international destinations and rejects malformed numbers", () => {
    expect(smsPhone("+2348030000000")).toBe("+2348030000000");
    expect(() => smsPhone("not a phone")).toThrow();
    expect(() => smsPhone("12345")).toThrow();
  });
  it("requires exactly five digits, including leading zeros", () => {
    expect(verificationMessage("01234")).toContain("01234");
    expect(() => verificationMessage("1234")).toThrow();
    expect(() => verificationMessage("123456")).toThrow();
    expect(() => verificationMessage("12abc")).toThrow();
  });
});