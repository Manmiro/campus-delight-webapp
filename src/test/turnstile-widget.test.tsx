import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnstileApi } from "@/lib/turnstile";
const mock = vi.hoisted(() => ({ load: vi.fn(), render: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/turnstile", async (original) => ({
  ...(await original<typeof import("@/lib/turnstile")>()),
  loadTurnstileScript: mock.load,
}));
import { TurnstileWidget } from "@/components/turnstile-widget";
const options = (index = 0) =>
  mock.render.mock.calls[index]![1] as Parameters<TurnstileApi["render"]>[1];
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mock.render.mockReturnValue("widget-1");
  mock.load.mockResolvedValue({ render: mock.render, remove: mock.remove });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Turnstile widget recovery", () => {
  it("renders the correct action without requiring a ready method", async () => {
    render(<TurnstileWidget action="gift" resetSignal={0} onToken={vi.fn()} onError={vi.fn()} />);
    await waitFor(() => expect(mock.render).toHaveBeenCalledOnce());
    expect(options().action).toBe("gift");
  });
  it("retries initial script failures when the user requests another check", async () => {
    mock.load.mockRejectedValueOnce(new Error("Script unavailable"));
    const onError = vi.fn();
    const onToken = vi.fn();
    const view = render(<TurnstileWidget resetSignal={0} onToken={onToken} onError={onError} />);
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "script-load" })),
    );
    expect(onToken).toHaveBeenCalledWith(null);
    view.rerender(<TurnstileWidget resetSignal={1} onToken={onToken} onError={onError} />);
    await waitFor(() => expect(mock.render).toHaveBeenCalledOnce());
    act(() => options().callback("fresh-token"));
    expect(onToken).toHaveBeenLastCalledWith("fresh-token");
  });
  it("reports the Cloudflare code without logging a token and keeps failure closed", async () => {
    const onToken = vi.fn();
    const onError = vi.fn();
    render(<TurnstileWidget resetSignal={0} onToken={onToken} onError={onError} />);
    await waitFor(() => expect(mock.render).toHaveBeenCalledOnce());
    act(() => {
      options()["error-callback"]("110200");
    });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "110200" }));
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(console.warn).toHaveBeenCalledWith("Security verification failed", { code: "110200" });
  });
  it("removes replaced widgets and ignores stale success callbacks", async () => {
    const onToken = vi.fn();
    const onError = vi.fn();
    const view = render(<TurnstileWidget resetSignal={0} onToken={onToken} onError={onError} />);
    await waitFor(() => expect(mock.render).toHaveBeenCalledOnce());
    const old = options();
    view.rerender(<TurnstileWidget resetSignal={1} onToken={onToken} onError={onError} />);
    await waitFor(() => expect(mock.render).toHaveBeenCalledTimes(2));
    expect(mock.remove).toHaveBeenCalledWith("widget-1");
    act(() => old.callback("stale-token"));
    expect(onToken).not.toHaveBeenCalledWith("stale-token");
  });
});
