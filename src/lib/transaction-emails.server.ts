import { supabaseAdmin as db } from '@/integrations/supabase/client.server';
import { sendTemplateEmail } from './email-templates/send-email';
import type { ReceiptKind, ReceiptProps } from './email-templates/transaction-receipt';

const money = (kobo: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(kobo / 100);
const tokens = (amount: number) => `${amount.toLocaleString('en-NG')} tokens`;
const date = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' });

/** Recipients, amounts and copy never come from browser-supplied email content. */
async function receipt(customerId: string, eventId: string, props: ReceiptProps) {
  const { data: profile, error } = await db.from('profiles').select('email,full_name').eq('id', customerId).single();
  if (error) throw error;
  if (!profile?.email) return;
  await sendTemplateEmail('transaction-receipt', profile.email, { templateData: { ...props, name: profile.full_name }, idempotencyKey: `transaction-receipt:${props.kind}:${eventId}:${customerId}` });
}

export async function emailTokenEntry(entryId: string) {
  const { data: entry, error } = await db.from('token_ledger').select('*').eq('id', entryId).single();
  if (error) throw error;
  if (!entry) return;
  const supported = ['welcome', 'reward', 'referral_locked', 'referral_unlock'] as const;
  const kind = supported.find(type => type === entry.tx_type);
  if (!kind) return;
  await receipt(entry.customer_id, entry.id, { kind, amount: tokens(entry.amount), reference: entry.reference, date: date(entry.created_at), details: [{ label: 'Available tokens after transaction', value: tokens(entry.available_after) }, { label: 'Locked tokens after transaction', value: tokens(entry.locked_after) }] });
}

export async function emailTransfer(transferId: string) {
  const { data: transfer, error } = await db.from('token_transfers').select('*').eq('id', transferId).eq('status', 'success').single();
  if (error) throw error;
  if (!transfer) return;
  // Two independent events: the sender's debit and this recipient's credit.
  await receipt(transfer.sender_id, transfer.id, { kind: 'transfer_out', amount: tokens(transfer.principal_tokens), reference: transfer.reference, date: date(transfer.created_at), details: [{ label: 'Transfer fee', value: tokens(transfer.fee_tokens) }, { label: 'Total tokens deducted', value: tokens(transfer.principal_tokens + transfer.fee_tokens) }] });
  await receipt(transfer.recipient_id, transfer.id, { kind: 'transfer_in', amount: tokens(transfer.principal_tokens), reference: transfer.reference, date: date(transfer.created_at) });
}

export async function emailOrder(orderId: string, kind: 'order' | 'fulfilled' | 'cancelled' = 'order') {
  const { data: order, error } = await db.from('orders').select('*,order_items(item_name,quantity)').eq('id', orderId).single();
  if (error) throw error;
  if (!order || (kind === 'cancelled' ? order.status !== 'cancelled' : kind === 'fulfilled' ? order.status !== 'fulfilled' : !['confirmed', 'fulfilled'].includes(order.status))) return;
  const details = [{ label: 'Meal', value: order.order_items.map(item => `${item.item_name} × ${item.quantity}`).join(', ') }, { label: 'Payment method', value: order.payment_method.replaceAll('_', ' ') }];
  details.push({ label: 'Collection', value: order.fulfillment_method === 'delivery' ? 'Delivery' : 'Pickup at your outlet' }, { label: 'Delivery fee', value: money(order.delivery_fee_kobo) });
  if (order.delivery_address) details.push({ label: 'Delivery address', value: order.delivery_address });
  if (order.payment_method === 'subscription_entitlement' && order.delivery_fee_kobo > 0) details.push({ label: kind === 'cancelled' ? 'Delivery refunded to wallet' : 'Delivery paid from wallet', value: money(order.delivery_fee_kobo) });
  if (order.payment_method === 'subscription_entitlement' && order.meal_cap_kobo != null) {
    details.push({ label: 'Meal cap per meal', value: money(order.meal_cap_kobo) },
      { label: 'Meal plan covers (1 meal)', value: money(order.meal_plan_covered_kobo) },
      { label: kind === 'cancelled' ? 'Meal co-pay refunded to wallet' : 'Meal co-pay paid from wallet', value: money(order.meal_copay_kobo) },
      { label: kind === 'cancelled' ? 'Total refunded to wallet' : 'Total wallet debit', value: money(order.total_kobo) });
  }
  if (order.loan_id) {
    const { data: loan } = await db.from('loans').select('total_due_kobo,charge_kobo,due_at').eq('id', order.loan_id).single();
    if (loan) details.push({ label: 'Total repayment including charge', value: money(loan.total_due_kobo) }, { label: 'Charge', value: money(loan.charge_kobo) }, { label: 'Repayment due', value: date(loan.due_at) });
  }
  if (kind === 'cancelled' && order.payment_method === 'tokens') details.push({ label: 'Tokens returned', value: tokens(order.tokens_used ?? 0) });
  if (kind === 'cancelled' && ['cash_wallet', 'card'].includes(order.payment_method)) details.push({ label: 'Wallet refund', value: money(order.total_kobo) });
  await receipt(order.customer_id, order.id, { kind, amount: order.payment_method === 'tokens' ? tokens(order.tokens_used ?? 0) : money(order.total_kobo), reference: order.reference, date: date(order.created_at), details });
}

export async function emailPayment(reference: string) {
  const { data: payment, error } = await db.from('payment_transactions').select('*').eq('paystack_reference', reference).eq('status', 'success').single();
  if (error) throw error;
  if (!payment) return;
  if (payment.purpose === 'order' && payment.related_id) return emailOrder(payment.related_id);
  if (payment.purpose !== 'wallet_funding' && payment.purpose !== 'subscription') return;
  const { data: fundingEntry, error: fundingError } = await db.from('wallet_ledger').select('balance_after_kobo').eq('reference', reference).eq('customer_id', payment.customer_id).eq('tx_type', 'funding').maybeSingle();
  if (fundingError) throw fundingError;
  const kind: ReceiptKind = payment.purpose === 'subscription' && !fundingEntry ? 'subscription' : 'funding';
  const details: { label: string; value: string }[] = [];
  if (kind === 'funding') {
    const entry = fundingEntry;
    if (payment.purpose === 'subscription') details.push({ label: 'Payment applied to wallet', value: 'Your plan was already paid, removed, or its price changed before this online payment completed.' });
    if (entry) details.push({ label: 'Wallet balance after funding', value: money(entry.balance_after_kobo) });
    const { data: offsets, error: offsetError } = await db.from('loan_repayments').select('*').eq('customer_id', payment.customer_id).eq('status', 'successful').like('reference', `AUTO-${reference}-%`);
    if (offsetError) throw offsetError;
    const repaid = (offsets ?? []).reduce((sum, r) => sum + r.amount_kobo, 0);
    if (repaid > 0) {
      details.push({ label: 'Automatically applied to Pay Later', value: money(repaid) });
      if (entry) details.push({ label: 'Wallet balance after automatic repayment', value: money(entry.balance_after_kobo - repaid) });
    }
    for (const r of offsets ?? []) {
      const { data: outstanding, error: balanceError } = await db.rpc('loan_outstanding_kobo', { p_loan_id: r.loan_id });
      if (balanceError) throw balanceError;
      await emailRepayment(r.reference, r.customer_id, Number(outstanding));
    }
  } else if (payment.related_id) {
    const { data: sub } = await db.from('subscriptions').select('plan,tier,start_date,end_date').eq('id', payment.related_id).single();
    if (sub) details.push({ label: 'Meal plan', value: `${sub.plan} · ${sub.tier}` }, { label: 'Service dates', value: `${sub.start_date} to ${sub.end_date}` });
  }
  await receipt(payment.customer_id, payment.id, { kind, amount: money(payment.amount_kobo), reference, date: date(payment.verified_at ?? payment.created_at), details });
}

export async function emailWalletSubscription(subscriptionId: string, reference: string) {
  const { data: sub, error } = await db.from('subscriptions').select('customer_id,plan,tier,price_kobo,start_date,end_date,payment_reference').eq('id', subscriptionId).eq('payment_reference', reference).single();
  if (error) throw error;
  if (!sub || sub.payment_reference !== reference || !sub.start_date || !sub.end_date) return;
  const { data: entry, error: ledgerError } = await db.from('wallet_ledger').select('*').eq('customer_id', sub.customer_id).eq('reference', reference).eq('tx_type', 'debit').single();
  if (ledgerError) throw ledgerError;
  if (!entry || entry.amount_kobo !== -sub.price_kobo) throw new Error('Subscription debit does not match receipt');
  const duration = Math.round((Date.parse(sub.end_date) - Date.parse(sub.start_date)) / 86400000) + 1;
  await receipt(sub.customer_id, entry.id, {
    kind: 'subscription', amount: money(-entry.amount_kobo), reference, date: date(entry.created_at),
    details: [
      { label: 'Meal plan', value: `${sub.plan} · ${sub.tier}` },
      { label: 'Duration', value: `${duration} days · ${sub.start_date} to ${sub.end_date}` },
      { label: 'Meals per day', value: String(sub.tier === 'basic' ? 1 : sub.tier === 'standard' ? 2 : 3) },
      { label: 'Payment method', value: 'Campus Delight cash wallet' },
      { label: 'Remaining wallet balance', value: money(entry.balance_after_kobo) },
    ],
  });
}

export async function emailRepayment(reference: string, customerId: string, outstandingKobo: number) {
  const { data: repayment, error } = await db.from('loan_repayments').select('*').eq('reference', reference).eq('customer_id', customerId).eq('status', 'successful').single();
  if (error) throw error;
  if (!repayment) return;
  await receipt(customerId, repayment.id, { kind: 'repayment', amount: money(repayment.amount_kobo), reference, date: date(repayment.created_at), details: [{ label: 'Remaining amount to repay', value: money(outstandingKobo) }] });
}

export async function emailOutletFee(reference: string, customerId: string) {
  const { data: app, error } = await db.from('outlet_transfer_applications').select('*').eq('reference', reference).eq('customer_id', customerId).single();
  if (error) throw error;
  if (!app) return;
  await receipt(customerId, app.id, { kind: 'outlet_fee', amount: app.fee_method === 'tokens' ? tokens(app.fee_amount) : money(app.fee_amount), reference, date: date(app.created_at), details: [{ label: 'Application fee', value: 'Non-refundable; approval is not guaranteed' }] });
}

export async function emailCreditAdjustment(historyId: string) {
  const { data: entry, error } = await db.from('credit_limit_history').select('*').eq('id', historyId).single();
  if (error) throw error;
  if (!entry) return;
  await receipt(entry.customer_id, entry.id, { kind: 'credit_adjustment', amount: money(entry.new_limit_kobo), reference: entry.id, date: date(entry.created_at), details: [{ label: 'Previous limit', value: money(entry.previous_limit_kobo) }] });
}

export async function emailOutletDecision(applicationId: string) {
  const { data: app, error } = await db.from('outlet_transfer_applications').select('*').eq('id', applicationId).single();
  if (error) throw error;
  if (!app || !['completed', 'rejected'].includes(app.status)) return;
  await receipt(app.customer_id, app.id, { kind: app.status === 'completed' ? 'outlet_approved' : 'outlet_rejected', amount: app.fee_method === 'tokens' ? tokens(app.fee_amount) : money(app.fee_amount), reference: app.reference, date: date(app.decided_at ?? app.created_at) });
}

/** A committed financial action must never be repeated just because email failed. */
export async function tryTransactionEmail(action: () => Promise<unknown>): Promise<'accepted' | 'unavailable'> {
  try { await action(); return 'accepted'; }
  catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'send_failed';
    console.warn('Transaction email unavailable', { code });
    return 'unavailable';
  }
}
