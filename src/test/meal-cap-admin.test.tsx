import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

const fixtures = vi.hoisted(() => ({
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  outlet: {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Campus Kitchen",
    code: "CAMPUS",
    location: "Benin",
    address: "Old address",
    contact_phone: "08012345678",
    contact_email: "outlet@example.com",
    status: "active",
    meal_cap_kobo: 200000,
    price_edit_locked: false,
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useSuspenseQuery: () => ({ data: [fixtures.outlet] }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[1] === "outlet-catalog" ? { outlet: fixtures.outlet, menu: [], prices: [] } : [],
  }),
}));
vi.mock("@/lib/admin.functions", () => ({
  adminUpdateOutlet: fixtures.update,
  adminListOutlets: vi.fn(),
  adminListOutletCatalog: vi.fn(),
  adminListOutletOrders: vi.fn(),
  adminSetOutletPriceEditLock: vi.fn(),
  adminUpsertMenuItem: vi.fn(),
  adminUpsertPlanPrice: vi.fn(),
  adminDeleteMenuItem: vi.fn(),
  adminCreateOutlet: vi.fn(),
  adminDeleteOutlet: vi.fn(),
  adminManagerLifecycle: vi.fn(),
  adminReplaceOutletManager: vi.fn(),
}));
vi.mock("@/lib/transactions.functions", () => ({ updateFoodOrder: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: fixtures.success, error: fixtures.error } }));
import { Route as OperationsRoute } from "@/routes/_authenticated/admin.operations";
import { Route as OutletsRoute } from "@/routes/_authenticated/admin.outlets";

function show(Page: ComponentType) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
  return invalidate;
}
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.update.mockResolvedValue({});
});
afterEach(cleanup);

describe("HQ meal cap controls", () => {
  it("enables Update Cap only for a valid changed value and refreshes outlet pricing after save", async () => {
    const invalidate = show(OperationsRoute.options.component as ComponentType);
    const input = screen.getByRole("spinbutton", { name: "Meal Plan Cap Per Meal" });
    expect(input).toHaveValue("2,000.00");
    const button = screen.getByRole("button", { name: "Update Cap" });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "2000" } });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "-1" } });
    expect(button).toBeDisabled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(input, { target: { value: "2500.50" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("2,500.50");
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() =>
      expect(fixtures.update).toHaveBeenCalledWith({
        data: { outletId: fixtures.outlet.id, mealCapKobo: 250050 },
      }),
    );
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["delivery-fee"] }));
  });
  it("shows cap values in the overview and saves cap together with edited outlet details", async () => {
    show(OutletsRoute.options.component as ComponentType);
    expect(screen.getByRole("columnheader", { name: "Meal Cap (₦)" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "₦2,000.00" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit Outlet Details" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Meal Plan Cap Per Meal" }), {
      target: { value: "3,000" },
    });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "New address" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(fixtures.update).toHaveBeenCalledWith({
        data: expect.objectContaining({
          outletId: fixtures.outlet.id,
          mealCapKobo: 300000,
          address: "New address",
          contactEmail: "outlet@example.com",
        }),
      }),
    );
  });
});
