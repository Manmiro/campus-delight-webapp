import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const paySubscriptionFromWallet = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subscriptionId: string; priceKobo: number }) => z.object({
    subscriptionId: z.string().uuid(),
    priceKobo: z.number().int().positive().safe(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { payFromWallet } = await import('./subscriptions.server');
    return payFromWallet(context.userId, data.subscriptionId, data.priceKobo);
  });

export const removePendingSubscription = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subscriptionId: string }) => z.object({ subscriptionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { removeUnpaidPlan } = await import('./subscriptions.server');
    await removeUnpaidPlan(context.userId, data.subscriptionId);
  });
