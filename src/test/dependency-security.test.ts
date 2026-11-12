// @vitest-environment node
import { describe, expect, it } from "vitest";
import deepmerge from "deepmerge";

describe("deepmerge prototype-poisoning patch", () => {
  it("blocks a dangerous source key even when the target has a null prototype", () => {
    const input = JSON.parse(
      '{"__proto__":{"isAdmin":true},"constructor":{"prototype":{"isAdmin":true}},"safe":"value"}',
    );
    const result = deepmerge(Object.create(null), input) as Record<string, unknown>;
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result["isAdmin"]).toBeUndefined();
    expect(Object.hasOwn(result, "constructor")).toBe(false);
    expect(result["safe"]).toBe("value");
  });
  it("does not copy prototype setters from an untrusted target", () => {
    const target = Object.create(null);
    Object.defineProperty(target, "__proto__", { value: { isAdmin: true }, enumerable: true });
    const result = deepmerge(target, { nested: { valid: true } }) as Record<string, unknown>;
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result["isAdmin"]).toBeUndefined();
    expect(result["nested"]).toEqual({ valid: true });
  });
  it("preserves normal recursive and array merge behavior used by email rendering", () => {
    expect(
      deepmerge(
        { format: { width: 80 }, list: ["one"] },
        { format: { wrap: true }, list: ["two"] },
      ),
    ).toEqual({ format: { width: 80, wrap: true }, list: ["one", "two"] });
  });
});
