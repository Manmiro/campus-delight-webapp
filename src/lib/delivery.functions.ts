import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { deliveryFeeSchema } from './delivery-rules';

export const setOutletDeliveryFee = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string; feeKobo: number }) => deliveryFeeSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc('set_outlet_delivery_fee', { p_outlet_id: data.outletId, p_fee_kobo: data.feeKobo });
    if (error) throw new Error(error.message);
    return { ok: true };
  });