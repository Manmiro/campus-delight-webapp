import { supabaseAdmin as db } from '@/integrations/supabase/client.server';

// These functions live in drizzle/proposed/ until approved, so generated types do not list them yet.
type PendingRpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export const pendingRpc: PendingRpc = (fn, args) =>
  (db.rpc as unknown as PendingRpc).call(db, fn, args);

export async function payFromWallet(customerId: string, subscriptionId: string, priceKobo: number) {
  const { data, error } = await pendingRpc('pay_subscription_from_wallet', {
    p_customer_id: customerId, p_subscription_id: subscriptionId, p_price_kobo: priceKobo,
  });
  if (error) throw new Error(error.message);
  const payment = data as { reference: string; balanceKobo: number; already: boolean };
  const { emailWalletSubscription, tryTransactionEmail } = await import('./transaction-emails.server');
  await tryTransactionEmail(() => emailWalletSubscription(subscriptionId, payment.reference));
  return payment;
}

export async function removeUnpaidPlan(customerId: string, subscriptionId: string) {
  const { error } = await pendingRpc('remove_pending_subscription', {
    p_customer_id: customerId, p_subscription_id: subscriptionId,
  });
  if (error) throw new Error(error.message);
}
