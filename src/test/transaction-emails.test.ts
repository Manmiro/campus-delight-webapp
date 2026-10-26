// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({ rows: {} as Record<string, any>, sent: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  from: (table: string) => {
    const query: any = { select: () => query, eq: () => query, single: async () => ({ data: fixtures.rows[table], error: null }), maybeSingle: async () => ({ data: fixtures.rows[table], error: null }) };
    return query;
  },
} }));
vi.mock('@/lib/email-templates/send-email', () => ({ sendTemplateEmail: fixtures.sent }));
import { emailOrder, emailPayment, emailTokenEntry, emailTransfer, tryTransactionEmail } from '@/lib/transaction-emails.server';

beforeEach(() => {
  fixtures.sent.mockReset().mockResolvedValue({ sent: true });
  fixtures.rows = { profiles: { email: 'customer@example.com', full_name: 'Ada Okafor' } };
});

describe('valid transaction receipts', () => {
  it('funding uses confirmed payment amount and funding ledger balance', async () => {
    fixtures.rows['payment_transactions'] = { id: 'payment-1', customer_id: 'customer-1', purpose: 'wallet_funding', amount_kobo: 200000, created_at: '2026-10-26T15:00:00Z' };
    fixtures.rows['wallet_ledger'] = { balance_after_kobo: 500000 };
    await emailPayment('CDPS-1');
    expect(fixtures.sent).toHaveBeenCalledWith('transaction-receipt', 'customer@example.com', expect.objectContaining({ idempotencyKey: 'transaction-receipt:funding:payment-1:customer-1', templateData: expect.objectContaining({ amount: '₦2,000.00', details: [{ label: 'Wallet balance after funding', value: '₦5,000.00' }] }) }));
  });
  it('sends distinct sender and recipient transfer receipts with the fee only on the debit', async () => {
    fixtures.rows['token_transfers'] = { id: 'transfer-1', sender_id: 'sender', recipient_id: 'recipient', principal_tokens: 200, fee_tokens: 10, reference: 'TRF-1', created_at: '2026-10-26T15:00:00Z' };
    await emailTransfer('transfer-1');
    expect(fixtures.sent).toHaveBeenCalledTimes(2);
    const first = fixtures.sent.mock.calls[0]?.[2];
    const second = fixtures.sent.mock.calls[1]?.[2];
    expect(first.templateData.amount).toBe('200 tokens');
    expect(first.templateData.details[1].value).toBe('210 tokens');
    expect(second.templateData.kind).toBe('transfer_in');
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });
  it('credits a reward receipt from its immutable ledger facts', async () => {
    fixtures.rows['token_ledger'] = { id: 'reward-1', customer_id: 'customer-1', tx_type: 'reward', amount: 20, available_after: 1020, locked_after: 100, reference: 'DAILY-1', created_at: '2026-10-26T15:00:00Z' };
    await emailTokenEntry('reward-1');
    expect(fixtures.sent.mock.calls[0]?.[2].templateData).toMatchObject({ kind: 'reward', amount: '20 tokens', details: [{ label: 'Available tokens after transaction', value: '1,020 tokens' }, { label: 'Locked tokens after transaction', value: '100 tokens' }] });
  });
  it('does not send a confirmation for a pending order', async () => {
    fixtures.rows['orders'] = { status: 'pending_payment' };
    await emailOrder('pending-order');
    expect(fixtures.sent).not.toHaveBeenCalled();
  });
  it('never suggests repeating a committed transaction when delivery fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await tryTransactionEmail(async () => { throw { code: 'domain_not_verified' }; });
    expect(result).toBe('unavailable');
    warn.mockRestore();
  });
  it('does not retry a suppressed recipient', async () => {
    fixtures.sent.mockResolvedValue({ sent: false, reason: 'recipient_suppressed' });
    fixtures.rows['token_ledger'] = { id: 'welcome-1', customer_id: 'customer-1', tx_type: 'welcome', amount: 1000, available_after: 1000, locked_after: 0, reference: 'WELCOME-1', created_at: '2026-10-26T15:00:00Z' };
    await emailTokenEntry('welcome-1');
    expect(fixtures.sent).toHaveBeenCalledTimes(1);
  });
});