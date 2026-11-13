// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkRequestSize,
  MAX_SERVER_REQUEST_BYTES,
  withSecurityHeaders,
} from "@/lib/request-security";

afterEach(() => vi.unstubAllEnvs());

describe("request size and browser protections", () => {
  it("allows sign-in and realtime connections to the configured Lovable Cloud backend", () => {
    const origin = "https://c--26e23df5-ee2e-4a9c-9175-3fb980bfd92d-prod.lovable.cloud";
    vi.stubEnv("VITE_SUPABASE_URL", `${origin}/`);
    const response = withSecurityHeaders(
      new Response("ok"),
      new Request("https://campusdelight.net/auth"),
    );
    const connections = response.headers
      .get("Content-Security-Policy")!
      .split("; ")
      .find((value) => value.startsWith("connect-src "))!
      .split(" ")
      .slice(1);
    expect(connections).toContain(origin);
    expect(connections).toContain(origin.replace("https:", "wss:"));
    expect(connections).not.toContain("https://*.lovable.cloud");
    expect(connections).not.toContain("*");
  });
  it("only adds the configured backend origin, never its path or credentials", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://ignored:ignored@backend.example.test/path?q=ignored");
    const response = withSecurityHeaders(
      new Response("ok"),
      new Request("https://campusdelight.net/auth"),
    );
    const policy = response.headers.get("Content-Security-Policy")!;
    expect(policy).toContain("https://backend.example.test wss://backend.example.test");
    expect(policy).not.toContain("ignored");
  });
  it.each([
    undefined,
    "not a URL; connect-src *",
    "data:text/plain,anything",
    "javascript:alert(1)",
  ])("keeps a restrictive policy for invalid or absent backend configuration %s", (backend) => {
    vi.stubEnv("VITE_SUPABASE_URL", backend);
    const response = withSecurityHeaders(
      new Response("ok"),
      new Request("https://campusdelight.net/auth"),
    );
    const policy = response.headers.get("Content-Security-Policy")!;
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain("connect-src *");
    expect(policy).not.toContain("javascript:");
    expect(policy).not.toContain("data:text");
  });
  it("rejects oversized content lengths before parsing", async () => {
    const request = new Request("https://campusdelight.net/api/test", {
      method: "POST",
      body: "{}",
      headers: { "Content-Length": String(MAX_SERVER_REQUEST_BYTES + 1) },
    });
    expect((await checkRequestSize(request))?.status).toBe(413);
  });
  it("bounds streaming requests even without a Content-Length header", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(40000));
        controller.enqueue(new Uint8Array(40000));
        controller.close();
      },
    });
    const request = new Request("https://campusdelight.net/api/test", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    expect((await checkRequestSize(request))?.status).toBe(413);
  });
  it("preserves the exact raw body needed for signed webhook verification", async () => {
    const raw = '{"event":"charge.success", "data":{"reference":"CDPS-example"}}';
    const request = new Request("https://campusdelight.net/api/webhook", {
      method: "POST",
      body: raw,
    });
    expect(await checkRequestSize(request)).toBeNull();
    expect(await request.text()).toBe(raw);
  });
  it("protects authenticated responses from caching and external framing without losing headers", () => {
    const result = withSecurityHeaders(
      new Response("ok", { headers: { "X-Test": "preserved" } }),
      new Request("https://campusdelight.net/_serverFn/test", {
        headers: { Authorization: "Bearer test" },
      }),
    );
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(result.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(result.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'self' https://lovable.dev",
    );
    expect(result.headers.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(result.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(result.headers.get("X-Test")).toBe("preserved");
  });
});
