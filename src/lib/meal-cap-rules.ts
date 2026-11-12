import { z } from 'zod';

/** Default most food value one meal-plan meal covers (₦2,000), until headquarters changes it per outlet. */
export const DEFAULT_SUBSCRIPTION_MEAL_CAP_KOBO = 200_000;

export const mealCapSchema = z.object({
  outletId: z.string().uuid(),
  capKobo: z.number().int().nonnegative().safe(),
});

/** Splits a meal-plan order: the plan covers food up to the cap; the wallet pays any extra plus delivery. */
export function mealPlanCharge(foodKobo: number, capKobo: number, deliveryFeeKobo: number) {
  const coveredKobo = Math.min(foodKobo, capKobo);
  const copayKobo = Math.max(foodKobo - capKobo, 0);
  return { coveredKobo, copayKobo, deliveryFeeKobo, walletChargeKobo: copayKobo + deliveryFeeKobo };
}
