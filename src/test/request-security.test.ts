// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  checkRequestSize,
  MAX_SERVER_REQUEST_BYTES,
  withSecurityHeaders,
} from "@/lib/request-security";

describe("request size and browser protections", () => {
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
