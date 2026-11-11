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
const getImageData = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  pixels = new Uint8ClampedArray(640 * 320 * 4).fill(255);
  getImageData.mockImplementation(() => ({ data: pixels }));
  let brush = { x: 0, y: 0, radius: 0 };
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
    arc: (x: number, y: number, radius: number) => {
      brush = { x, y, radius };
    },
    // Approximate the erased foil from each brush dab as the pointer moves.
    fill: () => {
      for (
        let y = Math.max(0, brush.y - brush.radius);
        y < Math.min(320, brush.y + brush.radius);
        y++
      ) {
        for (
          let x = Math.max(0, brush.x - brush.radius);
          x < Math.min(640, brush.x + brush.radius);
          x++
        ) {
          if ((x - brush.x) ** 2 + (y - brush.y) ** 2 <= brush.radius ** 2) {
            pixels[(y * 640 + x) * 4 + 3] = 0;
          }
        }
      }
    },
    getImageData,
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

function ticketCanvas() {
  const canvas = screen
    .getByRole("region", { name: "Daily fortune card" })
    .querySelector("canvas")!;
  canvas.setPointerCapture = vi.fn();
  canvas.hasPointerCapture = () => false;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 320,
    height: 160,
  } as DOMRect);
  return canvas;
}

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y = 50) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(canvas, event);
}

function rubTicket(canvas: HTMLCanvasElement) {
  for (const y of [16, 32, 48, 64]) {
    pointer(canvas, "pointerdown", 8, y);
    for (let x = 16; x <= 312; x += 8) pointer(canvas, "pointermove", x, y);
    pointer(canvas, "pointerup", 312, y);
  }
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
    const canvas = ticketCanvas();
    expect(screen.queryByRole("button", { name: "Reveal my fortune" })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Rub the golden ticket with your finger or cursor to uncover your daily coins.",
      ),
    ).toBeInTheDocument();
    rubTicket(canvas);
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Claiming…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Claiming…" }));
    rubTicket(canvas);
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
    expect(screen.getAllByRole("button", { name: "Come back tomorrow" })).toHaveLength(1);
    expect(ticketCanvas()).toHaveClass("hidden");
    expect(claim).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it.each(["retry link", "rubbing"])(
    "allows retry with %s after a failed claim without a premature prize or cue",
    async (method) => {
      claim
        .mockRejectedValueOnce(new Error("Connection lost"))
        .mockResolvedValueOnce({ spin: 4, bonus: 0, total: 4, streak: 1 });
      mount();
      const canvas = ticketCanvas();
      rubTicket(canvas);
      const retry = await screen.findByRole("button", { name: "Tap to retry" });
      expect(toastError).toHaveBeenCalledWith("Connection lost");
      expect(play).not.toHaveBeenCalled();
      expect(screen.queryByText(/\+\d+ tokens/)).not.toBeInTheDocument();
      if (method === "retry link") fireEvent.click(retry);
      else rubTicket(canvas);
      expect(await screen.findAllByText("+4 tokens")).toHaveLength(2);
      expect(claim).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("button", { name: "Tap to retry" })).not.toBeInTheDocument();
    },
  );

  it("only claims after enough of the coating has actually been erased", () => {
    const reveal = vi.fn();
    render(
      <ScratchFortuneCard
        prize={null}
        busy={false}
        disabled={false}
        error={false}
        onReveal={reveal}
        onPrepare={vi.fn()}
      />,
    );
    const canvas = ticketCanvas();
    for (let i = 0; i < 8; i++) {
      pointer(canvas, "pointerdown", 20);
      pointer(canvas, "pointermove", 21);
      pointer(canvas, "pointerup", 20);
    }
    expect(reveal).not.toHaveBeenCalled();
    rubTicket(canvas);
    expect(reveal).toHaveBeenCalledTimes(1);
    rubTicket(canvas);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it.each([
    [303, false],
    [304, true],
  ])(
    "requires at least 38 percent of foil to be cleared (%i of 800 samples)",
    (cleared, shouldReveal) => {
      const reveal = vi.fn();
      const sampledPixels = new Uint8ClampedArray(640 * 320 * 4).fill(255);
      let sample = 0;
      for (let y = 8; y < 320; y += 16) {
        for (let x = 8; x < 640; x += 16) {
          if (sample++ < cleared) sampledPixels[(y * 640 + x) * 4 + 3] = 0;
        }
      }
      getImageData.mockReturnValue({ data: sampledPixels });
      render(
        <ScratchFortuneCard
          prize={null}
          busy={false}
          disabled={false}
          error={false}
          onReveal={reveal}
          onPrepare={vi.fn()}
        />,
      );
      const canvas = ticketCanvas();
      pointer(canvas, "pointerdown", 20);
      pointer(canvas, "pointermove", 30);
      expect(reveal).not.toHaveBeenCalled();
      pointer(canvas, "pointerup", 30);
      expect(reveal).toHaveBeenCalledTimes(shouldReveal ? 1 : 0);
    },
  );
});
