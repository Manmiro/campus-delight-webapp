import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunZone } from "@/components/fun/fun-zone";
import { ScratchFortuneCard } from "@/components/fun/scratch-fortune-card";

const { claim, play, toastError } = vi.hoisted(() => ({
  claim: vi.fn(),
  play: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/lib/transactions.functions", () => ({
  claimDailyReward: claim,
  sendBirthdayGreeting: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/lib/queries", () => ({ getUserId: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/delight-feedback", () => ({
  prepareDelightFeedback: vi.fn(),
  playDelightFeedback: play,
}));
vi.mock("@/components/fun/confetti", () => ({ Confetti: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
let pixels: Uint8ClampedArray;
beforeEach(() => {
  vi.clearAllMocks();
  pixels = new Uint8ClampedArray(640 * 320 * 4).fill(255);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    fillRect: vi.fn(),
    setLineDash: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    getImageData: () => ({ data: pixels }),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(checkins: unknown[] = []) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["me", "checkins"], checkins);
  // Invalidation is verified separately from backend access in these UI tests.
  vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  render(
    <QueryClientProvider client={client}>
      <FunZone orders={[]} loans={[]} referrals={[]} dob={null} firstName="Ada" />
    </QueryClientProvider>,
  );
  return client;
}

describe("daily fortune reward", () => {
  it("shares one in-flight claim across spin and scratch and reveals the server prize", async () => {
    let resolve!: (prize: { spin: number; bonus: number; total: number; streak: number }) => void;
    claim.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const client = mount();
    fireEvent.click(screen.getByRole("button", { name: "Reveal my fortune" }));
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Claiming…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Claiming…" }));
    await act(async () => resolve({ spin: 13, bonus: 20, total: 33, streak: 3 }));
    expect(await screen.findAllByText("+33 tokens")).toHaveLength(2);
    expect(
      screen
        .getAllByRole("button", { name: "Come back tomorrow" })
        .every((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledExactlyOnceWith("tokens");
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["me"] });
  });

  it("restores an already claimed daily prize without calling the reward endpoint", () => {
    mount([{ checkin_date: today(), spin_tokens: 7, bonus_tokens: 50, streak: 7 }]);
    expect(screen.getAllByText("+57 tokens")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Come back tomorrow" })).toHaveLength(2);
    expect(claim).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it("allows retry after a failed claim without showing a prize or playing a cue", async () => {
    claim
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce({ spin: 4, bonus: 0, total: 4, streak: 1 });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Reveal my fortune" }));
    const retry = await screen.findByRole("button", { name: "Try reveal again" });
    expect(toastError).toHaveBeenCalledWith("Connection lost");
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(retry);
    expect(await screen.findAllByText("+4 tokens")).toHaveLength(2);
    expect(claim).toHaveBeenCalledTimes(2);
  });

  it("only claims after enough of the coating has actually been erased", () => {
    const reveal = vi.fn();
    const { container } = render(
      <ScratchFortuneCard
        prize={null}
        busy={false}
        disabled={false}
        error={false}
        onReveal={reveal}
        onPrepare={vi.fn()}
      />,
    );
    const canvas = container.querySelector("canvas")!;
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = () => false;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 320,
      height: 160,
    } as DOMRect);
    const pointer = (type: string, x: number) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: 50 });
      Object.defineProperty(event, "pointerId", { value: 1 });
      fireEvent(canvas, event);
    };
    for (let i = 0; i < 8; i++) {
      pointer("pointerdown", 20);
      pointer("pointerup", 20);
    }
    expect(reveal).not.toHaveBeenCalled();
    pixels.fill(0);
    pointer("pointerdown", 50);
    pointer("pointerup", 150);
    expect(reveal).toHaveBeenCalledTimes(1);
    pointer("pointerdown", 50);
    pointer("pointerup", 150);
    expect(reveal).toHaveBeenCalledTimes(1);
  });
});
