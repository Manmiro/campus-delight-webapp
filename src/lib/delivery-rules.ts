import { z } from 'zod';

export const DEFAULT_DELIVERY_FEE_KOBO = 60_000;
export const deliveryChoiceSchema = z.object({
  fulfillment: z.enum(['delivery', 'pickup']),
  address: z.string().trim().max(500).optional(),
  expectedFeeKobo: z.number().int().nonnegative().safe().optional(),
}).superRefine((data, ctx) => {
  if (data.fulfillment === 'delivery' && (!data.address || data.address.length < 5)) {
    ctx.addIssue({ code: 'custom', path: ['address'], message: 'Enter your delivery address (at least 5 characters).' });
  }
  if (data.fulfillment === 'delivery' && data.expectedFeeKobo === undefined) {
    ctx.addIssue({ code: 'custom', path: ['expectedFeeKobo'], message: 'Confirm the outlet delivery fee.' });
  }
});

export function deliveryTotal(foodKobo: number, feeKobo: number, fulfillment: 'delivery' | 'pickup') {
  return foodKobo + (fulfillment === 'delivery' ? feeKobo : 0);
}

export const deliveryFeeSchema = z.object({ outletId: z.string().uuid(), feeKobo: z.number().int().nonnegative().safe() });