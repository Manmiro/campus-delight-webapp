import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnstileApi } from "@/lib/turnstile";

const api: TurnstileApi = { render: vi.fn(() => "widget-1"), remove: vi.fn() };
beforeEach(() => {
  vi.resetModules();
  delete window.turnstile;
  document.getElementById("cloudflare-turnstile-script")?.remove();
});
afterEach(() => {
  vi.useRealTimers();
  delete window.turnstile;
  document.getElementById("cloudflare-turnstile-script")?.remove();
});
const script = () => document.getElementById("cloudflare-turnstile-script") as HTMLScriptElement;

describe("Turnstile script loading", () => {
  it("shares one script load and renders without relying on ready()", async () => {
    const { loadTurnstileScript } = await import("@/lib/turnstile");
    const first = loadTurnstileScript();
    expect(loadTurnstileScript()).toBe(first);
    expect(document.querySelectorAll("#cloudflare-turnstile-script")).toHaveLength(1);
    window.turnstile = api;
    script().dispatchEvent(new Event("load"));
    await expect(first).resolves.toBe(api);
  });
  it("retries a failed script with a new element rather than keeping a rejected promise", async () => {
    const { loadTurnstileScript } = await import("@/lib/turnstile");
    const first = loadTurnstileScript();
    const failedScript = script();
    failedScript.dispatchEvent(new Event("error"));
    await expect(first).rejects.toThrow("script-load");
    const second = loadTurnstileScript();
    expect(script()).not.toBe(failedScript);
    window.turnstile = api;
    script().dispatchEvent(new Event("load"));
    await expect(second).resolves.toBe(api);
  });
  it("times out a hung script and allows another attempt", async () => {
    vi.useFakeTimers();
    const { loadTurnstileScript } = await import("@/lib/turnstile");
    const first = loadTurnstileScript();
    vi.advanceTimersByTime(15000);
    await expect(first).rejects.toThrow("script-load");
    expect(script()).toBeNull();
    const second = loadTurnstileScript();
    window.turnstile = api;
    script().dispatchEvent(new Event("load"));
    await expect(second).resolves.toBe(api);
  });
  it("recovers when an existing script failed before the component mounted", async () => {
    vi.useFakeTimers();
    const stale = document.createElement("script");
    stale.id = "cloudflare-turnstile-script";
    document.head.appendChild(stale);
    const { loadTurnstileScript } = await import("@/lib/turnstile");
    const first = loadTurnstileScript();
    vi.advanceTimersByTime(15000);
    await expect(first).rejects.toThrow("script-load");
    const second = loadTurnstileScript();
    expect(script()).not.toBe(stale);
    window.turnstile = api;
    script().dispatchEvent(new Event("load"));
    await expect(second).resolves.toBe(api);
  });
  it("does not consider a loaded script successful without a usable API", async () => {
    const { loadTurnstileScript } = await import("@/lib/turnstile");
    const first = loadTurnstileScript();
    script().dispatchEvent(new Event("load"));
    await expect(first).rejects.toThrow("script-load");
  });
  it("distinguishes hostname configuration, timeout, and connectivity errors", async () => {
    const { turnstileFailure } = await import("@/lib/turnstile");
    expect(turnstileFailure("110200").message).toContain("website address");
    expect(turnstileFailure("110100").message).toContain("configured correctly");
    expect(turnstileFailure("110620").message).toContain("timed out");
    expect(turnstileFailure("200500").message).toContain("connection");
  });
});
