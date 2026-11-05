// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ claims: new Set<string>() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  from: () => ({
    upsert: (row: { idempotency_key: string }) => ({
      select: async () => {
        if (state.claims.has(row.idempotency_key)) return { data: [], error: null };
        state.claims.add(row.idempotency_key);
        return { data: [row], error: null };
      },
    }),
    delete: () => ({ eq: async (_c: string, key: string) => { state.claims.delete(key); return { error: null }; } }),
  }),
} }));
vi.mock('@/lib/email-templates/registry', () => ({ TEMPLATES: { 'transaction-receipt': { component: () => null, subject: 'Receipt' } } }));
vi.mock('@react-email/render', () => ({ render: async () => '<p>hi</p>' }));

import { sendTemplateEmail } from '@/lib/email-templates/send-email';

const fetchMock = vi.fn();
beforeEach(() => {
  state.claims.clear();
  process.env['PINGRAM_API_KEY'] = 'test-key';
  fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('email send deduplication', () => {
  it('sends the same receipt only once across repeated triggers', async () => {
    const key = 'transaction-receipt:welcome:entry-1:customer-1';
    const first = await sendTemplateEmail('transaction-receipt', 'a@example.com', { idempotencyKey: key });
    const second = await sendTemplateEmail('transaction-receipt', 'a@example.com', { idempotencyKey: key });
    expect(first).toEqual({ sent: true });
    expect(second).toEqual({ sent: false, reason: 'already_sent' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows a retry after the provider failed', async () => {
    const key = 'transaction-receipt:funding:pay-1:customer-1';
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response('bad', { status: 500 }));
    await expect(sendTemplateEmail('transaction-receipt', 'a@example.com', { idempotencyKey: key })).rejects.toThrow();
    const retry = await sendTemplateEmail('transaction-receipt', 'a@example.com', { idempotencyKey: key });
    expect(retry).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });
});
