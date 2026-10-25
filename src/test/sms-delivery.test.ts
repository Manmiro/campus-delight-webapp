import { afterEach, describe, expect, it, vi } from "vitest";
import { sendVerificationSms } from "@/lib/sms.server";

afterEach(() => vi.restoreAllMocks());
describe("Pingram verification delivery", () => {
  it("sends the SMS server-side and returns only acceptance tracking", async () => {
    const call = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ trackingId: "track-1", messages: [] })));
    expect(await sendVerificationSms("test-key", "08030000000", "01234")).toEqual({ trackingId: "track-1" });
    expect(call.mock.calls[0]?.[0]).toBe("https://api.pingram.io/sms");
    const request = call.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body));
    expect(body.to).toBe("+2348030000000");
    expect(body.message).toBe(verificationMessageForTest());
  });
  it("rejects provider HTTP errors without echoing the key or code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("invalid test-key 01234", { status: 401 }));
    await expect(sendVerificationSms("test-key", "08030000000", "01234")).rejects.toThrow("SMS provider failed [401]: invalid [redacted] [redacted]");
  });
  it("rejects failures inside successful HTTP responses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ trackingId: "t", error: { code: "no_balance" } })));
    await expect(sendVerificationSms("test-key", "08030000000", "01234")).rejects.toThrow("no_balance");
  });
});
function verificationMessageForTest() { return "Your Campus Delight verification code is 01234. It expires in 5 minutes. Do not share this code."; }