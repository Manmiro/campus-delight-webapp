import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pending: false, mutating: 0 }));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (value: { status: string }) => boolean }) =>
    select({ status: state.pending ? "pending" : "idle" }),
}));
vi.mock("@tanstack/react-query", () => ({
  useIsMutating: () => state.mutating,
}));

import { GlobalLoadingOverlay } from "@/components/global-loading-overlay";

beforeEach(() => {
  vi.useFakeTimers();
  state.pending = false;
  state.mutating = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("global loading overlay", () => {
  it("waits 150ms before showing a route transition and fades out after it settles", () => {
    const view = render(<GlobalLoadingOverlay />);
    state.pending = true;
    view.rerender(<GlobalLoadingOverlay />);

    act(() => vi.advanceTimersByTime(149));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status", { name: "Loading Campus Delight" })).toBeInTheDocument();

    state.pending = false;
    view.rerender(<GlobalLoadingOverlay />);
    act(() => vi.advanceTimersByTime(219));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("also responds to active mutations", () => {
    const view = render(<GlobalLoadingOverlay />);
    state.mutating = 1;
    view.rerender(<GlobalLoadingOverlay />);

    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
