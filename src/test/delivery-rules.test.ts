import { describe, expect, it } from 'vitest';
import { DEFAULT_DELIVERY_FEE_KOBO, deliveryTotal, deliveryChoiceSchema, deliveryFeeSchema } from '@/lib/delivery-rules';
import { orderPaymentOptions } from '@/lib/prd-rules';

describe('delivery and pickup pricing', () => {
  it('starts each outlet at ₦600', () => expect(DEFAULT_DELIVERY_FEE_KOBO).toBe(60000));
  it('automatically adds ₦600 to delivery', () => expect(deliveryTotal(20000, 60000, 'delivery')).toBe(80000));
  it('pickup adds no fee', () => expect(deliveryTotal(20000, 60000, 'pickup')).toBe(20000));
  it('uses an outlet-adjusted fee', () => expect(deliveryTotal(20000, 75000, 'delivery')).toBe(95000));
  it('requires a delivery address', () => expect(deliveryChoiceSchema.safeParse({ fulfillment: 'delivery', expectedFeeKobo: 60000 }).success).toBe(false));
  it('pickup does not require an address', () => expect(deliveryChoiceSchema.safeParse({ fulfillment: 'pickup' }).success).toBe(true));
  it('requires fee confirmation for delivery', () => expect(deliveryChoiceSchema.safeParse({ fulfillment: 'delivery', address: 'Hostel A room 5' }).success).toBe(false));
  it('rejects negative outlet fees', () => expect(deliveryFeeSchema.safeParse({ outletId: '5b9e7af9-16ed-47b8-8d2f-e7ac8c2362b3', feeKobo: -1 }).success).toBe(false));
  it('delivery tokens cover food and fee without mixing cash', () => {
    const state = { mealsLeftToday: 0, walletBalanceKobo: 0, tokenBalance: 799, totalKobo: deliveryTotal(20000, 60000, 'delivery'), availableCreditKobo: 0, isVerified: false, accountAgeHours: 0 };
    expect(orderPaymentOptions(state).tokens).toBe(false);
    expect(orderPaymentOptions({ ...state, tokenBalance: 800 }).tokens).toBe(true);
  });
});