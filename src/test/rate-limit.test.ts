// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const fixtures = vi.hoisted(() => ({
  rpc: vi.fn(),
  request: new Request("https://campusdelight.net"),
  status: vi.fn(),
  header: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: fixtures.rpc } }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => fixtures.request,
  getRequestIP: () => "127.0.0.1",
  setResponseStatus: fixtures.status,
  setResponseHeader: fixtures.header,
}));
import { enforcePublicRequestLimit } from "@/lib/rate-limit.server";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RATE_LIMIT_SECRET", "audit-secret-value");
  fixtures.rpc.mockResolvedValue({ data: true, error: null });
  fixtures.request = new Request("https://campusdelight.net", {
    headers: { "cf-connecting-ip": "192.0.2.1" },
  });
});
describe("public endpoint rate limits", () => {
  it("claims a persistent service-side budget with a hashed client identity", async () => {
    await enforcePublicRequestLimit("gift-lookup", 20);
    expect(fixtures.rpc).toHaveBeenCalledWith("consume_request_budget", {
      p_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_limit: 20,
      p_window_seconds: 60,
    });
    expect(JSON.stringify(fixtures.rpc.mock.calls)).not.toContain("192.0.2.1");
    expect(JSON.stringify(fixtures.rpc.mock.calls)).not.toContain("audit-secret-value");
  });
  it("ignores a forged X-Forwarded-For header", async () => {
    await enforcePublicRequestLimit("gift-lookup", 20);
    const first = fixtures.rpc.mock.calls[0]?.[1].p_key_hash;
    fixtures.request = new Request("https://campusdelight.net", {
      headers: { "cf-connecting-ip": "192.0.2.1", "x-forwarded-for": "203.0.113.99" },
    });
    await enforcePublicRequestLimit("gift-lookup", 20);
    expect(fixtures.rpc.mock.calls[1]?.[1].p_key_hash).toBe(first);
  });
  it("returns retry guidance when a budget is exhausted", async () => {
    fixtures.rpc.mockResolvedValue({ data: false, error: null });
    await expect(enforcePublicRequestLimit("gift-checkout", 5)).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(fixtures.status).toHaveBeenCalledWith(429);
    expect(fixtures.header).toHaveBeenCalledWith("Retry-After", "60");
  });
  it("fails closed if the persistent budget store is unavailable", async () => {
    fixtures.rpc.mockResolvedValue({ data: null, error: { message: "Database unavailable" } });
    await expect(enforcePublicRequestLimit("gift-checkout", 5)).rejects.toThrow(
      "Request protection is temporarily unavailable",
    );
  });
});
