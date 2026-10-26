import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

function resultObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Transaction result unavailable');
  return value as Record<string, unknown>;
}

export const transferTokens = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: { identifier: string; principal: number }) => z.object({ identifier: z.string().trim().min(1).max(254), principal: z.number().int().positive().max(500) }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await context.supabase.rpc('transfer_tokens', { p_recipient_identifier: data.identifier, p_principal: data.principal });
    if (error) throw new Error(error.message);
    const tx = resultObject(result);
    const mail = await import('./transaction-emails.server');
    const emailStatus = await mail.tryTransactionEmail(async () => { if (typeof tx['reference'] === 'string') await mail.emailTransfer(tx['reference']); });
    return { ok: true, emailStatus };
  });

export const placeFoodOrder = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: { items: { menu_item_id: string; quantity: number }[]; method: string; subscriptionId?: string; termDays?: number }) => z.object({ items: z.array(z.object({ menu_item_id: z.string().uuid(), quantity: z.number().int().positive().max(100) })).min(1).max(100), method: z.enum(['cash_wallet', 'tokens', 'subscription_entitlement', 'food_credit']), subscriptionId: z.string().uuid().optional(), termDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional() }).parse(input))
  .handler(async ({ context, data }) => {
    const startedAt = new Date().toISOString();
    const { data: result, error } = await context.supabase.rpc('place_order', { p_items: data.items, p_payment_method: data.method, ...(data.subscriptionId ? { p_subscription_id: data.subscriptionId } : {}), ...(data.termDays ? { p_loan_term_days: data.termDays } : {}) });
    if (error) throw new Error(error.message);
    const tx = resultObject(result);
    const mail = await import('./transaction-emails.server');
    const emailStatus = await mail.tryTransactionEmail(async () => { if (typeof tx['order_id'] === 'string') await mail.emailOrder(tx['order_id']); });
    await mail.tryTransactionEmail(async () => {
      const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
      const { data: entry } = await db.from('token_ledger').select('id').eq('related_customer_id', context.userId).eq('tx_type', 'referral_unlock').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (entry) await mail.emailTokenEntry(entry.id);
    });
    return { ok: true, emailStatus };
  });

export const repayFoodLoan = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: { loanId: string; amountKobo: number }) => z.object({ loanId: z.string().uuid(), amountKobo: z.number().int().positive().safe() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await context.supabase.rpc('repay_loan', { p_loan_id: data.loanId, p_amount_kobo: data.amountKobo });
    if (error) throw new Error(error.message);
    const tx = resultObject(result);
    const mail = await import('./transaction-emails.server');
    const emailStatus = await mail.tryTransactionEmail(async () => { if (typeof tx['reference'] === 'string' && typeof tx['outstanding_kobo'] === 'number') await mail.emailRepayment(tx['reference'], context.userId, tx['outstanding_kobo']); });
    return { ok: true, emailStatus };
  });

export const claimDailyReward = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: result, error } = await context.supabase.rpc('claim_daily_checkin');
    if (error) throw new Error(error.message);
    const tx = resultObject(result);
    const mail = await import('./transaction-emails.server');
    await mail.tryTransactionEmail(async () => {
      const { data: entry, error: readError } = await context.supabase.from('token_ledger').select('id').eq('customer_id', context.userId).eq('tx_type', 'reward').order('created_at', { ascending: false }).limit(1).single();
      if (readError) throw readError;
      await mail.emailTokenEntry(entry.id);
    });
    return { spin: Number(tx['spin']), bonus: Number(tx['bonus']), streak: Number(tx['streak']), total: Number(tx['total']) };
  });

export const applyOutletTransfer = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string; feeMethod: string }) => z.object({ outletId: z.string().uuid(), feeMethod: z.enum(['cash', 'tokens']) }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: result, error } = await context.supabase.rpc('apply_outlet_transfer', { p_to_outlet_id: data.outletId, p_fee_method: data.feeMethod });
    if (error) throw new Error(error.message);
    const tx = resultObject(result);
    const mail = await import('./transaction-emails.server');
    await mail.tryTransactionEmail(async () => { if (typeof tx['reference'] === 'string') await mail.emailOutletFee(tx['reference'], context.userId); });
    return { ok: true };
  });

export const updateFoodOrder = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; action: 'fulfill' | 'cancel' }) => z.object({ orderId: z.string().uuid(), action: z.enum(['fulfill', 'cancel']) }).parse(input))
  .handler(async ({ context, data }) => {
    // The existing RPC enforces staff/outlet/admin permissions before any send.
    const { error } = await context.supabase.rpc(data.action === 'fulfill' ? 'fulfill_order' : 'cancel_order', { p_order_id: data.orderId });
    if (error) throw new Error(error.message);
    const mail = await import('./transaction-emails.server');
    await mail.tryTransactionEmail(() => mail.emailOrder(data.orderId, data.action === 'fulfill' ? 'fulfilled' : 'cancelled'));
    return { ok: true };
  });

/** Registration rewards are delivered after the owner confirms their email and signs in. */
export const acknowledgeRegistrationRewards = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: auth } = await context.supabase.auth.getUser();
    if (!auth.user?.email_confirmed_at) throw new Error('Confirm your email first');
    const mail = await import('./transaction-emails.server');
    await mail.tryTransactionEmail(async () => {
      const { data: entry } = await context.supabase.from('token_ledger').select('id').eq('customer_id', context.userId).eq('tx_type', 'welcome').limit(1).maybeSingle();
      if (entry) await mail.emailTokenEntry(entry.id);
    });
    await mail.tryTransactionEmail(async () => {
      const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
      const { data: entry } = await db.from('token_ledger').select('id').eq('related_customer_id', context.userId).eq('tx_type', 'referral_locked').limit(1).maybeSingle();
      if (entry) await mail.emailTokenEntry(entry.id);
    });
    return { ok: true };
  });