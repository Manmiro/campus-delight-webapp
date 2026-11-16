import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Foodie ID gift lookup", () => {
  it("allows at most 10 lookups per minute per network", () => {
    const src = readFileSync("src/lib/gifting.functions.ts", "utf8");
    expect(src).toContain('enforcePublicRequestLimit("gift-lookup", 10)');
  });
});
