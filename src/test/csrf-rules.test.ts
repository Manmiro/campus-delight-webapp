// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isTrustedAppOrigin, isTrustedFetchSite } from "@/lib/csrf-rules";

describe("server-function domain trust", () => {
  it.each([
    ["https://campusdelight.net", "https://www.campusdelight.net/_serverFn/test"],
    ["https://www.campusdelight.net", "https://campusdelight.net/_serverFn/test"],
  ])("trusts the owned domain pair %s", (origin, url) => {
    expect(isTrustedAppOrigin(origin, url)).toBe(true);
    expect(isTrustedFetchSite("same-site", new Request(url, { headers: { Origin: origin } }))).toBe(true);
  });

  it.each(["https://attacker.example", "https://evil.campusdelight.net", "https://campusdelight.net.evil.example", "http://campusdelight.net"]) (
    "rejects an untrusted origin %s", (origin) => {
      const url = "https://www.campusdelight.net/_serverFn/test";
      expect(isTrustedAppOrigin(origin, url)).toBe(false);
      expect(isTrustedFetchSite("same-site", new Request(url, { headers: { Origin: origin } }))).toBe(false);
    },
  );

  it("keeps preview same-origin requests working without trusting other previews", () => {
    const origin = "https://id-preview--26e23df5-ee2e-4a9c-9175-3fb980bfd92d.lovable.app";
    expect(isTrustedAppOrigin(origin, `${origin}/_serverFn/test`)).toBe(true);
    expect(isTrustedFetchSite("same-origin", new Request(`${origin}/_serverFn/test`))).toBe(true);
    expect(isTrustedAppOrigin("https://other.lovable.app", `${origin}/_serverFn/test`)).toBe(false);
  });

  it("checks a same-site Referer when Origin is missing", () => {
    expect(isTrustedFetchSite("same-site", new Request("https://www.campusdelight.net/_serverFn/test", {
      headers: { Referer: "https://campusdelight.net/auth" },
    }))).toBe(true);
  });

  it("rejects cross-site, missing-source and malformed-source requests", () => {
    const url = "https://www.campusdelight.net/_serverFn/test";
    expect(isTrustedFetchSite("cross-site", new Request(url, { headers: { Origin: "https://campusdelight.net" } }))).toBe(false);
    expect(isTrustedFetchSite("same-site", new Request(url))).toBe(false);
    expect(isTrustedFetchSite("same-site", new Request(url, { headers: { Referer: "invalid" } }))).toBe(false);
    expect(isTrustedFetchSite("none", new Request(url))).toBe(false);
  });
});