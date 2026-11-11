import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ComponentProps } from "react";
const fixtures = vi.hoisted(() => ({
  lookup: vi.fn(),
  checkout: vi.fn(),
  verify: vi.fn(),
  reference: undefined as string | undefined,
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
  await waitFor(() => expect(screen.getByText("Chioma E.")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Yes, that’s my person/ }));
}
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.reference = undefined;
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
  it("starts lookup on the eighth character without waiting for a timer or extra action", async () => {
    show();
    const field = screen.getByLabelText("Student’s Foodie ID");
    for (const value of ["c", "cd", "cd050", "cd05061"])
      fireEvent.change(field, { target: { value } });
    expect(fixtures.lookup).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "cd050619" } });
    expect(fixtures.lookup).toHaveBeenCalledExactlyOnceWith({ data: { foodieId: "CD050619" } });
    await screen.findByText("Chioma E.");
  });
  it("retries a failed lookup immediately without refreshing", async () => {
    fixtures.lookup.mockRejectedValueOnce(new Error("Lookup unavailable"));
    show();
    fireEvent.change(screen.getByLabelText("Student’s Foodie ID"), {
      target: { value: "CD050619" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Lookup unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try lookup again" }));
    expect(fixtures.lookup).toHaveBeenCalledTimes(2);
    await screen.findByText("Chioma E.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("ignores an older lookup when the donor changes or clears the ID", async () => {
    let resolveOld!: (value: unknown) => void;
    fixtures.lookup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    show();
    const field = screen.getByLabelText("Student’s Foodie ID");
    fireEvent.change(field, { target: { value: "CD000001" } });
    fireEvent.change(field, { target: { value: "CD050619" } });
    await screen.findByText("Chioma E.");
    await act(async () => {
      resolveOld(null);
    });
    expect(screen.getByText("Chioma E.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: "" } });
    expect(screen.queryByText("Chioma E.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Yes, that’s my person/ })).toBeDisabled();
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
    const send = screen.getByRole("button", { name: /Send gift/ });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(fixtures.checkout).toHaveBeenCalledTimes(2));
    await screen.findByRole("alert");
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
