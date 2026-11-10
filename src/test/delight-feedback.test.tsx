import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelightToggle } from "@/components/delight-toggle";
import { playDelightFeedback, setDelightFeedback } from "@/lib/delight-feedback";

const vibrate = vi.fn();
const createOscillator = vi.fn();
const stop = vi.fn();
const linearRampToValueAtTime = vi.fn();
const saved = new Map<string, string>();
const storage = {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => {
    saved.set(key, value);
  },
};
beforeEach(() => {
  saved.clear();
  vi.stubGlobal("localStorage", storage);
  vi.clearAllMocks();
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
  createOscillator.mockImplementation(() => ({
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop,
  }));
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      currentTime = 0;
      destination = {};
      createOscillator = createOscillator;
      createGain = () => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime,
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      });
    },
  );
});
afterEach(() => {
  cleanup();
  setDelightFeedback(true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("optional delight feedback", () => {
  it("defaults to on and syncs the saved toggle across mounted controls", () => {
    render(
      <>
        <DelightToggle />
        <DelightToggle />
      </>,
    );
    expect(screen.getAllByRole("button", { name: "Sound and haptics: on" })).toHaveLength(2);
    playDelightFeedback("cart");
    expect(createOscillator).toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith(8);
    fireEvent.click(screen.getAllByRole("button", { name: "Sound and haptics: on" })[1]!);
    expect(localStorage.getItem("campus-delight-feedback")).toBe("off");
    expect(screen.getAllByRole("button", { name: "Sound and haptics: off" })).toHaveLength(2);
    createOscillator.mockClear();
    vibrate.mockClear();
    playDelightFeedback("order");
    expect(createOscillator).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("honors a previously saved off preference", () => {
    saved.set("campus-delight-feedback", "off");
    render(<DelightToggle />);
    expect(screen.getByRole("button", { name: "Sound and haptics: off" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    playDelightFeedback("tokens");
    expect(createOscillator).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it.each([
    ["tokens", [0.07, 0.035, 0.07 / 3, 0.05]],
    ["cart", [0.11, 0.032]],
    ["order", [0.09, 0.09, 0.09, 0.09]],
  ] as const)("doubles the audio levels for the %s cue", (cue, levels) => {
    playDelightFeedback(cue);
    expect(linearRampToValueAtTime.mock.calls.map(([level]) => level)).toEqual(levels);
  });

  it("keeps cues optional on devices that reject haptics and respects reduced motion", () => {
    setDelightFeedback(true);
    vibrate.mockImplementationOnce(() => {
      throw new Error("Unavailable");
    });
    expect(() => playDelightFeedback("tokens")).not.toThrow();
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    vibrate.mockClear();
    playDelightFeedback("order");
    expect(vibrate).not.toHaveBeenCalled();
    expect(createOscillator).toHaveBeenCalled();
  });

  it("works for the session when preference storage is blocked", () => {
    vi.spyOn(storage, "getItem").mockImplementation(() => {
      throw new Error("Denied");
    });
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("Denied");
    });
    render(<DelightToggle />);
    expect(screen.getByRole("button", { name: "Sound and haptics: on" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Sound and haptics: on" }));
    expect(screen.getByRole("button", { name: "Sound and haptics: off" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
