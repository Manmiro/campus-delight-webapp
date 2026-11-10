// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const db = new PGlite();
const customer = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const outlet = '00000000-0000-0000-0000-000000000003';
const subscription = '00000000-0000-0000-0000-000000000004';
const sql = (file: string) => readFileSync(`drizzle/migrations/${file}`, 'utf8');
const functionSQL = (source: string, name: string) => {
  const start = source.toLowerCase().indexOf(`create or replace function public.${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  return source.slice(start, source.indexOf('$$;', source.toLowerCase().indexOf('as $$', start)) + 3);
};

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY, outlet_id uuid, is_active boolean DEFAULT true);
    CREATE TABLE outlets(id uuid PRIMARY KEY);
    CREATE TABLE wallets(customer_id uuid PRIMARY KEY, balance_kobo bigint CHECK(balance_kobo >= 0), updated_at timestamptz);
    CREATE TABLE notifications(customer_id uuid, title text, body text);
    CREATE TABLE loans(id uuid, customer_id uuid, status text, due_at timestamptz, created_at timestamptz);
    CREATE TABLE orders(id uuid, customer_id uuid, payment_method text, total_kobo bigint, reference text, status text, outlet_id uuid);
    CREATE FUNCTION unlock_referral_reward(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;`);
  const subs = sql('0002_subscriptions_pricing_entitlements.sql');
  await db.exec(subs.slice(0, subs.indexOf('alter table')));
  const ledger = sql('0001_ledgers_transfers_referrals_otp_config.sql');
  await db.exec(ledger.slice(0, ledger.indexOf('create table public.token_transfers')));
  const payments = sql('0003_menus_orders_payments.sql');
  const start = payments.indexOf('create table public.payment_transactions');
  await db.exec(payments.slice(start, payments.indexOf(');', start) + 2));
  await db.exec(functionSQL(sql('0005_business_logic_rpcs.sql'), 'activate_subscription'));
  await db.exec(functionSQL(sql('0039_automated_overdue_loans.sql'), 'apply_wallet_funding'));
  await db.exec(readFileSync('drizzle/proposed/subscription_wallet_checkout.sql', 'utf8'));
}, 30000);

beforeEach(async () => {
  await db.exec(`TRUNCATE subscriptions, meal_entitlements, profiles, wallets, wallet_ledger, notifications, outlet_plan_prices, payment_transactions, outlets CASCADE;
    INSERT INTO outlets(id) VALUES('${outlet}');
    INSERT INTO profiles(id,outlet_id) VALUES('${customer}','${outlet}'),('${other}','${outlet}');
    INSERT INTO wallets VALUES('${customer}',3000000,now());
    INSERT INTO outlet_plan_prices(outlet_id,plan,tier,price_kobo) VALUES('${outlet}','weekly','standard',1800000);
    INSERT INTO subscriptions(id,customer_id,outlet_id,plan,tier,price_kobo) VALUES('${subscription}','${customer}','${outlet}','weekly','standard',1);`);
});
afterAll(async () => db.close());

const pay = (id = customer, price = 1800000) => db.query<{ result: { reference: string; balanceKobo: number; already: boolean } }>(
  'SELECT pay_subscription_from_wallet($1,$2,$3) result', [id, subscription, price]);
const settle = (reference = 'CDPS-test', amount = 1800000, currency = 'NGN') => db.query<{ result: { applied: boolean; status: string; creditedToWallet: boolean } }>(
  'SELECT settle_verified_payment($1,$2,$3,$4) result', [reference, amount, currency, { status: 'success', reference }]);
const prepare = (reference = 'CDPS-test') => db.query('SELECT prepare_subscription_payment($1,$2,$3)', [customer, subscription, reference]);
const balance = async () => Number((await db.query<{ balance_kobo: number }>('SELECT balance_kobo FROM wallets')).rows[0]?.balance_kobo);

describe('atomic subscription wallet checkout', () => {
  it('uses authoritative pricing, records the exact debit and activates seven days with two meals per day', async () => {
    const paid = (await pay()).rows[0]!.result;
    expect(paid).toMatchObject({ balanceKobo: 1200000, already: false });
    expect(paid.reference).toMatch(/^CDWS-/);
    expect(await balance()).toBe(1200000);
    expect((await db.query('SELECT tx_type,amount_kobo,balance_after_kobo,description FROM wallet_ledger')).rows).toEqual([
      { tx_type: 'debit', amount_kobo: -1800000, balance_after_kobo: 1200000, description: 'Meal subscription: Weekly (Standard)' },
    ]);
    expect((await db.query('SELECT status,price_kobo,payment_reference FROM subscriptions')).rows[0]).toMatchObject({ status: 'active', price_kobo: 1800000, payment_reference: paid.reference });
    const meals = (await db.query<{ allowance: number }>('SELECT allowance FROM meal_entitlements')).rows;
    expect(meals).toHaveLength(7);
    expect(meals.every(meal => meal.allowance === 2)).toBe(true);
    expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(1);
  });
  it.each([['basic', 1], ['turbo', 3]] as const)('generates %s meal allowances', async (tier, allowance) => {
    await db.query('UPDATE subscriptions SET tier=$1', [tier]);
    await db.query('UPDATE outlet_plan_prices SET tier=$1', [tier]);
    await pay();
    const meals = (await db.query<{ allowance: number }>('SELECT allowance FROM meal_entitlements')).rows;
    expect(meals).toHaveLength(7);
    expect(meals.every(meal => meal.allowance === allowance)).toBe(true);
  });
  it('allows an exact wallet balance and never goes below zero', async () => {
    await db.exec('UPDATE wallets SET balance_kobo=1800000');
    await pay();
    expect(await balance()).toBe(0);
  });
  it('retries return the same reference without a second debit or notification', async () => {
    const first = (await pay()).rows[0]!.result;
    const second = (await pay()).rows[0]!.result;
    expect(second).toEqual({ ...first, already: true });
    expect(await balance()).toBe(1200000);
    expect((await db.query('SELECT * FROM wallet_ledger')).rows).toHaveLength(1);
    expect((await db.query('SELECT * FROM notifications')).rows).toHaveLength(1);
  });
  it('cannot spend the same wallet funds on two subscriptions', async () => {
    await db.exec(`INSERT INTO subscriptions(customer_id,outlet_id,plan,tier,price_kobo) VALUES('${customer}','${outlet}','weekly','standard',1800000)`);
    await pay();
    await expect(db.query('SELECT pay_subscription_from_wallet($1,id,1800000) FROM subscriptions WHERE id<>$2', [customer, subscription])).rejects.toThrow('Insufficient wallet balance');
    expect(await balance()).toBe(1200000);
  });
  it('insufficient funds leave no debit, activation or entitlements', async () => {
    await db.exec('UPDATE wallets SET balance_kobo=100');
    await expect(pay()).rejects.toThrow('Insufficient wallet balance');
    expect(await balance()).toBe(100);
    expect((await db.query('SELECT * FROM wallet_ledger')).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM meal_entitlements')).rows).toHaveLength(0);
    expect((await db.query('SELECT status FROM subscriptions')).rows[0]).toEqual({ status: 'awaiting_payment' });
  });
  it('rolls the debit back if activation fails', async () => {
    await db.exec(`CREATE FUNCTION reject_entitlement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Activation failed'; END $$;
      CREATE TRIGGER reject_entitlement BEFORE INSERT ON meal_entitlements FOR EACH ROW EXECUTE FUNCTION reject_entitlement();`);
    try {
      await expect(pay()).rejects.toThrow('Activation failed');
      expect(await balance()).toBe(3000000);
      expect((await db.query('SELECT * FROM wallet_ledger')).rows).toHaveLength(0);
      expect((await db.query('SELECT status FROM subscriptions')).rows[0]).toEqual({ status: 'awaiting_payment' });
    } finally { await db.exec('DROP TRIGGER reject_entitlement ON meal_entitlements; DROP FUNCTION reject_entitlement()'); }
  });
  it('rejects other customers, stale quotes, inactive accounts and inactive prices', async () => {
    await expect(pay(other)).rejects.toThrow('not found for your account');
    await expect(pay(customer, 1)).rejects.toThrow('Plan price changed');
    await db.exec('UPDATE outlet_plan_prices SET is_active=false');
    await expect(pay()).rejects.toThrow('not available');
    await db.exec('UPDATE profiles SET is_active=false');
    await expect(pay()).rejects.toThrow('active account');
    expect(await balance()).toBe(3000000);
  });
  it('browser roles cannot invoke service payment and removal RPCs', async () => {
    for (const signature of ['pay_subscription_from_wallet(uuid,uuid,bigint)', 'prepare_subscription_payment(uuid,uuid,text)', 'remove_pending_subscription(uuid,uuid)', 'settle_verified_payment(text,bigint,text,jsonb)']) {
      const result = await db.query<{ allowed: boolean }>("SELECT has_function_privilege('authenticated',$1,'EXECUTE') allowed", [signature]);
      expect(result.rows[0]?.allowed).toBe(false);
      expect((await db.query<{ allowed: boolean }>("SELECT has_function_privilege('service_role',$1,'EXECUTE') allowed", [signature])).rows[0]?.allowed).toBe(true);
    }
  });
});

describe('online checkout and pending-plan removal', () => {
  it('prepares an online transaction with the authoritative price and settles only once', async () => {
    await prepare();
    await settle();
    await settle();
    expect(await balance()).toBe(3000000);
    expect((await db.query('SELECT * FROM meal_entitlements')).rows).toHaveLength(7);
    expect((await db.query('SELECT status FROM payment_transactions')).rows[0]).toEqual({ status: 'success' });
    await expect(pay()).rejects.toThrow('not awaiting payment');
  });
  it('credits a late online payment to the wallet after wallet activation, exactly once', async () => {
    await prepare();
    await pay();
    expect((await settle()).rows[0]?.result).toMatchObject({ applied: true, creditedToWallet: true });
    expect((await settle()).rows[0]?.result).toMatchObject({ creditedToWallet: true });
    expect(await balance()).toBe(3000000);
    expect((await db.query('SELECT * FROM meal_entitlements')).rows).toHaveLength(7);
    expect((await db.query("SELECT * FROM wallet_ledger WHERE tx_type='funding'")).rows).toHaveLength(1);
  });
  it('does not credit a payment that already activated this plan if its transaction status was reset', async () => {
    await prepare();
    await settle();
    await db.exec("UPDATE payment_transactions SET status='failed'");
    expect((await settle()).rows[0]?.result).toMatchObject({ applied: true, creditedToWallet: false });
    expect(await balance()).toBe(3000000);
    expect((await db.query('SELECT * FROM wallet_ledger')).rows).toHaveLength(0);
  });
  it('removes only owned unpaid plans, preserving late payment funds', async () => {
    await prepare();
    await expect(db.query('SELECT remove_pending_subscription($1,$2)', [other, subscription])).rejects.toThrow('not found for your account');
    await db.query('SELECT remove_pending_subscription($1,$2)', [customer, subscription]);
    await expect(pay()).rejects.toThrow('not awaiting payment');
    await expect(prepare('CDPS-new')).rejects.toThrow('not awaiting payment');
    await settle();
    expect(await balance()).toBe(4800000);
    expect((await db.query('SELECT * FROM meal_entitlements')).rows).toHaveLength(0);
    expect((await db.query('SELECT status FROM subscriptions')).rows[0]).toEqual({ status: 'cancelled' });
  });
  it('cannot remove a paid plan', async () => {
    await pay();
    await expect(db.query('SELECT remove_pending_subscription($1,$2)', [customer, subscription])).rejects.toThrow('Only an unpaid plan');
  });
  it('rejects a payment verification mismatch without activating or crediting funds', async () => {
    await prepare();
    expect((await settle('CDPS-test', 1800001)).rows[0]?.result).toMatchObject({ applied: false, status: 'verification_mismatch' });
    expect((await settle('CDPS-test', 1800000, 'USD')).rows[0]?.result).toMatchObject({ applied: false });
    expect(await balance()).toBe(3000000);
    expect((await db.query('SELECT * FROM meal_entitlements')).rows).toHaveLength(0);
  });
});
