import { z } from "zod";
import { naira } from "./format";

export const MEAL_CAP_HELP =
  "The maximum food value covered by 1 meal entitlement at this outlet. Any food total above this amount is automatically debited from the student's cash wallet as a co-pay.";
export const mealCapSchema = z.number().int().positive().safe();

export function parseMealCap(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole = "", fraction = ""] = trimmed.replaceAll(",", "").split(".");
  const exactKobo = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (exactKobo > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const kobo = Number(exactKobo);
  return mealCapSchema.safeParse(kobo).success ? kobo : null;
}

export function formatMealCap(kobo: number): string {
  return (kobo / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function mealPlanCharge(foodKobo: number, capKobo: number, deliveryKobo: number) {
  const coveredKobo = Math.min(foodKobo, capKobo);
  const copayKobo = Math.max(0, foodKobo - capKobo);
  return { coveredKobo, copayKobo, walletKobo: copayKobo + deliveryKobo };
}

export function mealWalletMessage(walletKobo: number): string {
  return `Your cash wallet needs ${naira(walletKobo)} to cover the meal co-pay and delivery fee. Please top up your wallet to complete this order.`;
}
