import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FulfillmentDialog } from "@/components/fulfillment-dialog";
import { mealPlanCharge, mealWalletMessage, parseMealCap } from "@/lib/meal-cap-rules";
afterEach(cleanup);

describe("student co-pay review", () => {
  it.each([
    [260000, "delivery", 120000, 60000],
    [150000, "pickup", 0, 0],
  ] as const)(
    "shows food %i and %s as a wallet debit of %i",
    (food, fulfillment, walletDebit, copay) => {
      const charge = mealPlanCharge(food, 200000, fulfillment === "delivery" ? 60000 : 0);
      expect(charge).toMatchObject({ walletKobo: walletDebit, copayKobo: copay });
      render(
        <FulfillmentDialog
          open
          onOpenChange={vi.fn()}
          outletName="Campus Kitchen"
          feeKobo={60000}
          foodKobo={food}
          totalKobo={charge.walletKobo}
          fulfillment={fulfillment}
          onChoose={vi.fn()}
          address="Hostel A room 5"
          onAddress={vi.fn()}
          paymentStep
          onContinue={vi.fn()}
          onPay={vi.fn()}
          onBack={vi.fn()}
          pending={false}
          canPay={false}
          subscription
          mealPlanCoveredKobo={charge.coveredKobo}
          mealCopayKobo={charge.copayKobo}
          mealWalletError={walletDebit > 0 ? mealWalletMessage(walletDebit) : undefined}
          paymentOptions={[]}
          method="subscription_entitlement"
          onMethod={vi.fn()}
        />,
      );
      expect(screen.getByText("Meal co-pay from cash wallet").parentElement).toHaveTextContent(
        copay ? "₦600" : "₦0",
      );
      expect(screen.getByText("Wallet debit").parentElement).toHaveTextContent(
        walletDebit ? "₦1,200" : "₦0",
      );
      if (walletDebit) {
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Your cash wallet needs ₦1,200 to cover the meal co-pay and delivery fee. Please top up your wallet to complete this order.",
        );
        expect(screen.getByRole("button", { name: "Pay & place order" })).toBeDisabled();
      }
    },
  );
  it.each(["", "-1", "0", "1.001", "2,,000", "2,00", "NaN", "90071992547409.92"])(
    "rejects invalid or unsafe cap input %s",
    (value) => {
      expect(parseMealCap(value)).toBeNull();
    },
  );
  it("accepts grouped naira and exact kobo without floating point rounding", () => {
    expect(parseMealCap("2,000.25")).toBe(200025);
    expect(parseMealCap("0.29")).toBe(29);
    expect(parseMealCap("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
  });
});
