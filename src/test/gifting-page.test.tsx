import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ComponentProps } from "react";
const fixtures = vi.hoisted(() => ({
  lookup: vi.fn(),
  checkout: vi.fn(),
  verify: vi.fn(),
  reference: undefined as string | undefined,
  resets: [] as number[],
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useSearch: () => ({ reference: fixtures.reference }),
  }),
  Link: ({
    to,
    search: _search,
    children,
    ...props
  }: ComponentProps<"a"> & { to: string; search?: unknown }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/gifting.functions", () => ({
  lookupGiftRecipient: fixtures.lookup,
  initializeGift: fixtures.checkout,
  verifyGift: fixtures.verify,
}));
vi.mock("@/lib/avatar", () => ({ defaultAvatarFor: () => "/default-avatar.webp" }));
vi.mock("@/components/turnstile-widget", () => ({
  TurnstileWidget: ({
    onToken,
    onError,
    resetSignal,
  }: {
    onToken: (token: string) => void;
    onError: (error: { code: string; message: string }) => void;
    resetSignal: number;
  }) => {
    fixtures.resets.push(resetSignal);
    return (
      <>
        <button type="button" onClick={() => onToken("test-captcha")}>
          Verify security
        </button>
        <button
          type="button"
          onClick={() => onError({ code: "200500", message: "Security check could not load." })}
        >
          Simulate security error
        </button>
      </>
    );
  },
}));
import { Route } from "@/routes/feed-someone";
const Page = Route.options.component as ComponentType;
function show() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Page />
    </QueryClientProvider>,
  );
}
async function findPerson() {
  fireEvent.change(screen.getByLabelText("Student’s Foodie ID"), { target: { value: "cd050619" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify security" }));
  await waitFor(() => expect(screen.getByText("Chioma E.")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Yes, that’s my person/ }));
}
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.reference = undefined;
  fixtures.resets = [];
  fixtures.lookup.mockResolvedValue({
    foodieId: "CD050619",
    name: "Chioma E.",
    gender: "female",
    avatarUrl: null,
    outlet: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Campus kitchen",
      deliveryFeeKobo: 60000,
    },
    prices: [{ plan: "weekly", tier: "standard", price_kobo: 1800000 }],
    menu: [
      {
        id: "00000000-0000-0000-0000-000000000002",
        name: "Jollof and chicken",
        price_kobo: 200000,
        description: "Freshly cooked",
      },
    ],
  });
  fixtures.checkout.mockRejectedValue(new Error("Gateway unavailable"));
});
afterEach(cleanup);
describe("guest gifting page", () => {
  it("preserves a ready security check while typing the Foodie ID", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Verify security" }));
    const field = screen.getByLabelText("Student’s Foodie ID");
    for (const value of ["c", "cd", "cd050", "cd050619"])
      fireEvent.change(field, { target: { value } });
    await waitFor(() => expect(fixtures.lookup).toHaveBeenCalledOnce());
    expect(fixtures.resets.every((value) => value === 0)).toBe(true);
  });
  it("clears recovered security errors and permits another attempt without refreshing", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Simulate security error" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Security check could not load.");
    fireEvent.click(screen.getByRole("button", { name: "Try security check again" }));
    expect(fixtures.resets.at(-1)).toBe(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Simulate security error" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify security" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("verifies a recipient live and sends the chosen gift without requiring an account", async () => {
    show();
    await findPerson();
    fireEvent.click(screen.getByRole("button", { name: "₦10,000" }));
    fireEvent.click(screen.getByRole("button", { name: /Add your personal touch/ }));
    fireEvent.change(screen.getByLabelText("Your name, as they know you"), {
      target: { value: "Mum" },
    });
    fireEvent.change(screen.getByLabelText("Your email for the receipt"), {
      target: { value: "mum@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/A personal note/), {
      target: { value: "Good luck ❤️" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify security" }));
    fireEvent.click(screen.getByRole("button", { name: /Send gift/ }));
    await waitFor(() =>
      expect(fixtures.checkout).toHaveBeenCalledWith({
        data: expect.objectContaining({
          foodieId: "CD050619",
          kind: "wallet",
          expectedAmountKobo: 1000000,
          sponsorName: "Mum",
          sponsorEmail: "mum@example.com",
          note: "Good luck ❤️",
        }),
      }),
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Gateway unavailable"));
  });
  it("uses live outlet plan pricing and prevents unavailable combinations", async () => {
    show();
    await findPerson();
    fireEvent.click(screen.getByRole("button", { name: /Give a food plan/ }));
    expect(screen.getByText("₦18,000 · live outlet price")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Meals per day"), { target: { value: "turbo" } });
    expect(screen.getByRole("button", { name: /Add your personal touch/ })).toBeDisabled();
  });
  it("requires a selected meal and delivery address and includes delivery in the total", async () => {
    show();
    await findPerson();
    fireEvent.click(screen.getByRole("button", { name: /Send a surprise meal/ }));
    expect(screen.getByRole("button", { name: /Add your personal touch/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Fresh from their campus kitchen"), {
      target: { value: "00000000-0000-0000-0000-000000000002" },
    });
    fireEvent.change(screen.getByLabelText("How should they receive it?"), {
      target: { value: "delivery" },
    });
    expect(screen.getByRole("button", { name: /Add your personal touch/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Campus delivery address"), {
      target: { value: "Hostel A room 12" },
    });
    expect(screen.getByRole("button", { name: /Add your personal touch/ })).toBeEnabled();
    expect(screen.getByText("₦2,600")).toBeInTheDocument();
  });
  it("shows a settled gift as successful even if confirmation emails are delayed", async () => {
    fixtures.reference = "CDG-00000000-0000-0000-0000-000000000005";
    fixtures.verify.mockResolvedValue({
      applied: true,
      status: "success",
      kind: "wallet",
      emailStatus: "unavailable",
    });
    show();
    await waitFor(() =>
      expect(screen.getByText("You just made someone’s day.")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Your gift is settled. Confirmation emails are delayed/),
    ).toBeInTheDocument();
    expect(fixtures.lookup).not.toHaveBeenCalled();
  });
});
