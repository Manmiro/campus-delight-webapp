// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({ rpc: vi.fn(), email: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: fixtures.rpc } }));
vi.mock('@/lib/transaction-emails.server', () => ({
  emailWalletSubscription: fixtures.email,
  tryTransactionEmail: async (action: () => Promise<unknown>) => { try { await action(); } catch { /* Do not repeat a committed purchase on email failure. */ } },
}));
import { payFromWallet, removeUnpaidPlan } from '@/lib/subscriptions.server';

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.rpc.mockResolvedValue({ data: { reference: 'CDWS-committed', balanceKobo: 1200000, already: false }, error: null });
  fixtures.email.mockResolvedValue(undefined);
});

describe('subscription feature handlers', () => {
  it('sends the receipt only after a committed RPC, using its reference', async () => {
    await payFromWallet('authenticated-customer', 'subscription-1', 1800000);
    expect(fixtures.rpc).toHaveBeenCalledWith('pay_subscription_from_wallet', { p_customer_id: 'authenticated-customer', p_subscription_id: 'subscription-1', p_price_kobo: 1800000 });
    expect(fixtures.email).toHaveBeenCalledWith('subscription-1', 'CDWS-committed');
    expect(fixtures.rpc.mock.invocationCallOrder[0]).toBeLessThan(fixtures.email.mock.invocationCallOrder[0]!);
  });
  it('does not issue a receipt when the debit is rejected', async () => {
    fixtures.rpc.mockResolvedValue({ data: null, error: { message: 'Insufficient wallet balance' } });
    await expect(payFromWallet('customer', 'subscription', 1800000)).rejects.toThrow('Insufficient wallet balance');
    expect(fixtures.email).not.toHaveBeenCalled();
  });
  it('keeps a successful purchase successful when receipt delivery fails', async () => {
    fixtures.email.mockRejectedValue(new Error('Provider unavailable'));
    await expect(payFromWallet('customer', 'subscription', 1800000)).resolves.toMatchObject({ reference: 'CDWS-committed' });
    expect(fixtures.rpc).toHaveBeenCalledTimes(1);
  });
  it('removes a plan using the authenticated customer id and surfaces database refusal', async () => {
    await removeUnpaidPlan('authenticated-customer', 'subscription-1');
    expect(fixtures.rpc).toHaveBeenCalledWith('remove_pending_subscription', { p_customer_id: 'authenticated-customer', p_subscription_id: 'subscription-1' });
    fixtures.rpc.mockResolvedValue({ error: { message: 'Only an unpaid plan can be removed' } });
    await expect(removeUnpaidPlan('customer', 'paid-plan')).rejects.toThrow('Only an unpaid plan');
  });
});
