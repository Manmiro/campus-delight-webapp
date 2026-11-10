import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps, ComponentType } from 'react';

const fixtures = vi.hoisted(() => ({
  balance: 1500000,
  subs: [] as Record<string, unknown>[],
  walletPay: vi.fn(), onlinePay: vi.fn(), remove: vi.fn(), insert: vi.fn(), success: vi.fn(), error: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ to, children, ...props }: ComponentProps<'a'> & { to: string }) => <a href={to} {...props}>{children}</a>,
}));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useSuspenseQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === 'plan-prices'
      ? [{ plan: 'weekly', tier: 'standard', price_kobo: 1800000, is_active: true }]
      : queryKey[1] === 'profile' ? { outlet_id: 'outlet-1', outlet: { name: 'Campus kitchen' } }
      : queryKey[1] === 'subscriptions' ? fixtures.subs : { balance_kobo: fixtures.balance },
    isError: false,
  }),
}));
vi.mock('@/lib/queries', () => ({
  profileQuery: { queryKey: ['me', 'profile'] }, subscriptionsQuery: { queryKey: ['me', 'subscriptions'] },
  walletQuery: { queryKey: ['me', 'wallet'] }, myPlanPricesQuery: () => ({ queryKey: ['plan-prices', 'outlet-1'] }),
  getUserId: async () => 'customer-1',
}));
vi.mock('@/lib/payments.functions', () => ({ initializePayment: fixtures.onlinePay }));
vi.mock('@/lib/subscriptions.functions', () => ({ paySubscriptionFromWallet: fixtures.walletPay, removePendingSubscription: fixtures.remove }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ insert: (data: unknown) => {
  fixtures.insert(data);
  return { select: () => ({ single: async () => ({ data: { id: 'new-subscription' }, error: null }) }) };
} }) } }));
vi.mock('sonner', () => ({ toast: { success: fixtures.success, error: fixtures.error } }));

import { Route } from '@/routes/_authenticated/_customer.subscription';
const Page = Route.options.component as ComponentType;
function showPage() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
}
const pendingSection = () => screen.getByText('Your subscriptions').closest('section')!;

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.balance = 1500000;
  fixtures.subs = [{ id: 'pending-1', plan: 'weekly', tier: 'standard', price_kobo: 1800000, status: 'awaiting_payment' }];
  fixtures.walletPay.mockResolvedValue({ reference: 'CDWS-1', balanceKobo: 1200000, already: false });
  fixtures.remove.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('subscription payment choices', () => {
  it('shows Paystack and disabled wallet payment with available balance and top-up guidance', () => {
    showPage();
    const pending = within(pendingSection());
    expect(pending.getByRole('button', { name: 'Pay now' })).toBeEnabled();
    expect(pending.getByRole('button', { name: 'Pay from wallet · ₦15,000 available' })).toBeDisabled();
    expect(pending.getByText(/Needs ₦18,000 \(₦3,000 more\)/)).toBeInTheDocument();
    expect(pending.getByRole('link', { name: 'Top up wallet' })).toHaveAttribute('href', '/wallet');
    expect(pending.getByRole('button', { name: 'Remove unpaid Weekly STANDARD plan' })).toBeEnabled();
  });
  it('pays an existing pending plan from the wallet without creating another plan', async () => {
    fixtures.balance = 3000000;
    showPage();
    fireEvent.click(within(pendingSection()).getByRole('button', { name: /Pay from wallet/ }));
    await waitFor(() => expect(fixtures.walletPay).toHaveBeenCalledWith({ data: { subscriptionId: 'pending-1', priceKobo: 1800000 } }));
    await waitFor(() => expect(fixtures.success).toHaveBeenCalled());
    expect(fixtures.insert).not.toHaveBeenCalled();
    expect(fixtures.onlinePay).not.toHaveBeenCalled();
  });
  it('creates a pending plan before paying for a newly selected plan from the wallet', async () => {
    fixtures.balance = 3000000;
    showPage();
    const picker = document.getElementById('plans')!;
    const button = within(picker).getAllByRole('button', { name: /Pay from wallet/ }).find(button => !button.hasAttribute('disabled'))!;
    fireEvent.click(button);
    await waitFor(() => expect(fixtures.walletPay).toHaveBeenCalledWith({ data: { subscriptionId: 'new-subscription', priceKobo: 1800000 } }));
    expect(fixtures.insert).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'customer-1', plan: 'weekly', tier: 'standard', status: 'awaiting_payment' }));
  });
  it('sends the pending subscription to Paystack checkout', async () => {
    fixtures.onlinePay.mockRejectedValueOnce(new Error('Gateway unavailable'));
    showPage();
    fireEvent.click(within(pendingSection()).getByRole('button', { name: 'Pay now' }));
    await waitFor(() => expect(fixtures.onlinePay).toHaveBeenCalledWith({ data: { purpose: 'subscription', relatedId: 'pending-1', origin: window.location.origin } }));
    await waitFor(() => expect(fixtures.error).toHaveBeenCalledWith('Gateway unavailable'));
    expect(fixtures.walletPay).not.toHaveBeenCalled();
  });
  it('removes an unpaid plan through the authenticated feature handler', async () => {
    showPage();
    fireEvent.click(within(pendingSection()).getByRole('button', { name: /Remove unpaid/ }));
    await waitFor(() => expect(fixtures.remove).toHaveBeenCalledWith({ data: { subscriptionId: 'pending-1' } }));
    expect(fixtures.walletPay).not.toHaveBeenCalled();
  });
  it('hides removed plans and offers no payment or deletion for active plans', () => {
    fixtures.subs = [
      { id: 'removed-1', plan: 'weekend', tier: 'basic', price_kobo: 1, status: 'cancelled' },
      { id: 'active-1', plan: 'weekly', tier: 'standard', price_kobo: 1800000, status: 'active', start_date: '2026-11-10', end_date: '2026-11-16' },
    ];
    showPage();
    const pending = within(pendingSection());
    expect(pending.queryByText('Weekend · BASIC')).not.toBeInTheDocument();
    expect(pending.queryByRole('button')).not.toBeInTheDocument();
    expect(pending.getByText('Weekly · STANDARD')).toBeInTheDocument();
  });
});
