// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: mock.request }));
import { readServerSecret } from "@/lib/server-secret.server";
const key = "TURNSTILE_SECRET_KEY";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(key, "");
  mock.request.mockReturnValue(new Request("https://campusdelight.net"));
});
afterEach(() => vi.unstubAllEnvs());
const request = (value: unknown) => ({ runtime: { cloudflare: { env: { [key]: value } } } });
describe("request-scoped server secrets", () => {
  it("reads the runtime binding when native process.env has no key", () => {
    mock.request.mockReturnValue(request("runtime-test-secret"));
    expect(readServerSecret(key)).toBe("runtime-test-secret");
  });
  it("prefers current bindings to a stale process key and follows rotation on the next request", () => {
    vi.stubEnv(key, "old-process-key");
    mock.request
      .mockReturnValueOnce(request("first-test-key"))
      .mockReturnValueOnce(request("rotated-test-key"));
    expect(readServerSecret(key)).toBe("first-test-key");
    expect(readServerSecret(key)).toBe("rotated-test-key");
  });
  it.each(["", "  ", null, {}])(
    "fails closed for an explicitly invalid runtime binding (%s)",
    (value) => {
      vi.stubEnv(key, "old-process-key");
      mock.request.mockReturnValue(request(value));
      expect(readServerSecret(key)).toBeUndefined();
    },
  );
  it("supports Node development and jobs without a request context", () => {
    vi.stubEnv(key, "node-test-key");
    mock.request.mockImplementation(() => {
      throw new Error("No StartEvent");
    });
    expect(readServerSecret(key)).toBe("node-test-key");
  });
  it("returns no secret when neither source supplies it", () => {
    expect(readServerSecret(key)).toBeUndefined();
  });
});
