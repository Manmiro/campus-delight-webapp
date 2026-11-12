// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SUBSCRIPTION_MEAL_CAP_KOBO, mealCapSchema, mealPlanCharge } from '@/lib/meal-cap-rules';

describe('meal plan charge split', () => {
  it('defaults each outlet to ₦2,000 per meal', () => expect(DEFAULT_SUBSCRIPTION_MEAL_CAP_KOBO).toBe(200_000));
  it('charges nothing extra when food is within the limit', () => expect(mealPlanCharge(150_000, 200_000, 0).walletChargeKobo).toBe(0));
  it('charges only the amount above the limit plus delivery', () =>
    expect(mealPlanCharge(260_000, 200_000, 60_000)).toEqual({ coveredKobo: 200_000, copayKobo: 60_000, deliveryFeeKobo: 60_000, walletChargeKobo: 120_000 }));
  it('rejects a negative limit', () => expect(mealCapSchema.safeParse({ outletId: '5b9e7af9-16ed-47b8-8d2f-e7ac8c2362b3', capKobo: -1 }).success).toBe(false));
});

const CUSTOMER = '00000000-0000-0000-0000-0000000000c1';
const OUTLET = '00000000-0000-0000-0000-0000000000a1';
const SUB = '00000000-0000-0000-0000-0000000000b1';
const RICE = '00000000-0000-0000-0000-0000000000d1';
const migration = readdirSync('drizzle/migrations').find((f) => f.endsWith('_subscription_meal_cap.sql'));

describe('meal plan limit in the database', () => {
  const db = new PGlite();
  beforeAll(async () => {
    if (!migration) throw new Error('Meal cap migration missing');
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid', true),'')::uuid $$;
      CREATE FUNCTION public.is_central_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.admin', true),'')='yes' $$;
      CREATE TABLE public.outlets(id uuid PRIMARY KEY, delivery_fee_kobo bigint NOT NULL DEFAULT 60000);
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, outlet_id uuid, created_at timestamptz DEFAULT now(), verification_status text DEFAULT 'verified');
      CREATE TABLE public.menu_items(id uuid PRIMARY KEY, outlet_id uuid, name text, price_kobo bigint, is_available boolean DEFAULT true, is_credit_eligible boolean DEFAULT true);
      CREATE TABLE public.wallets(customer_id uuid PRIMARY KEY, balance_kobo bigint, updated_at timestamptz);
      CREATE TABLE public.wallet_ledger(customer_id uuid, tx_type text, amount_kobo bigint, balance_after_kobo bigint, reference text, description text);
      CREATE TABLE public.subscriptions(id uuid PRIMARY KEY, customer_id uuid, outlet_id uuid, status text);
      CREATE TABLE public.meal_entitlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid, customer_id uuid, service_date date, allowance int, redeemed int DEFAULT 0);
      CREATE TABLE public.orders(id uuid PRIMARY KEY, customer_id uuid, outlet_id uuid, payment_method text, total_kobo bigint, tokens_used bigint, subscription_id uuid, loan_id uuid, status text, reference text, fulfillment_method text, delivery_fee_kobo bigint, delivery_address text);
      CREATE TABLE public.order_items(order_id uuid, menu_item_id uuid, item_name text, unit_price_kobo bigint, quantity int);
      CREATE TABLE public.notifications(customer_id uuid, title text, body text);
      CREATE TABLE public.audit_logs(actor_id uuid, action text, entity text, entity_id text, details jsonb);
      CREATE FUNCTION public.unlock_referral_reward(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
      CREATE FUNCTION public.apply_wallet_refund(p_customer uuid, p_amount bigint, p_ref text, p_order uuid) RETURNS void LANGUAGE sql AS $$
        UPDATE public.wallets SET balance_kobo=balance_kobo+p_amount WHERE customer_id=p_customer $$;
      INSERT INTO public.outlets(id) VALUES ('${OUTLET}');
      INSERT INTO public.profiles(id, outlet_id) VALUES ('${CUSTOMER}', '${OUTLET}');
      INSERT INTO public.subscriptions VALUES ('${SUB}', '${CUSTOMER}', '${OUTLET}', 'active');
      INSERT INTO public.menu_items(id, outlet_id, name, price_kobo) VALUES ('${RICE}', '${OUTLET}', 'Jollof rice', 130000);`);
    await db.exec(readFileSync(`drizzle/migrations/${migration}`, 'utf8'));
    await db.exec(`CREATE TRIGGER refund_subscription_delivery AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.refund_subscription_delivery();`);
  }, 30000);
  afterAll(async () => db.close());
  beforeEach(async () => {
    await db.exec(`DELETE FROM public.orders; DELETE FROM public.wallet_ledger; DELETE FROM public.meal_entitlements; DELETE FROM public.wallets;
      UPDATE public.outlets SET subscription_meal_cap_kobo=200000;
      INSERT INTO public.meal_entitlements(subscription_id, customer_id, service_date, allowance) VALUES ('${SUB}', '${CUSTOMER}', (now() AT TIME ZONE 'Africa/Lagos')::date, 2);
      SELECT set_config('test.uid', '${CUSTOMER}', false); SELECT set_config('test.admin', '', false);`);
  });
  const order = (qty: number, fulfillment = 'pickup') => db.query<{ r: { total_kobo: number; meal_plan_copay_kobo: number } }>(
    `SELECT public.place_order_with_fulfillment($1::jsonb,'subscription_entitlement',$2,$3,$4,$5::uuid,NULL) AS r`,
    [JSON.stringify([{ menu_item_id: RICE, quantity: qty }]), fulfillment, fulfillment === 'delivery' ? 'Hostel B, room 12' : null, fulfillment === 'delivery' ? 60000 : null, SUB]);
  const balance = async () => Number((await db.query<{ b: number }>(`SELECT balance_kobo AS b FROM public.wallets`)).rows[0]?.b);
  const redeemed = async () => Number((await db.query<{ r: number }>(`SELECT redeemed AS r FROM public.meal_entitlements`)).rows[0]?.r);

  it('new outlets start with a ₦2,000 limit', async () => {
    const { rows } = await db.query<{ c: number }>(`SELECT column_default AS c FROM information_schema.columns WHERE table_name='outlets' AND column_name='subscription_meal_cap_kobo'`);
    expect(String(rows[0]?.c)).toBe('200000');
  });
  it('a meal within the limit takes nothing from the wallet', async () => {
    await db.exec(`INSERT INTO public.wallets VALUES ('${CUSTOMER}', 50000, now())`);
    await order(1);
    expect(await balance()).toBe(50000);
    expect(await redeemed()).toBe(1);
  });
  it('a ₦2,600 meal at a ₦2,000 limit with ₦600 delivery takes ₦1,200 from the wallet', async () => {
    await db.exec(`INSERT INTO public.wallets VALUES ('${CUSTOMER}', 500000, now())`);
    const { rows } = await order(2, 'delivery');
    expect(Number(rows[0]?.r.meal_plan_copay_kobo)).toBe(60000);
    expect(Number(rows[0]?.r.total_kobo)).toBe(120000);
    expect(await balance()).toBe(380000);
    expect(await redeemed()).toBe(1);
  });
  it('rejects the meal and uses no meal when the wallet cannot pay the extra', async () => {
    await db.exec(`INSERT INTO public.wallets VALUES ('${CUSTOMER}', 59999, now())`);
    await expect(order(2)).rejects.toThrow('Top up your wallet');
    expect(await balance()).toBe(59999);
    expect(await redeemed()).toBe(0);
  });
  it('cancelling returns the extra and delivery to the wallet', async () => {
    await db.exec(`INSERT INTO public.wallets VALUES ('${CUSTOMER}', 500000, now())`);
    await order(2, 'delivery');
    await db.exec(`UPDATE public.orders SET status='cancelled'`);
    expect(await balance()).toBe(500000);
  });
  it('only headquarters can change the limit, and it is recorded', async () => {
    await expect(db.query(`SELECT public.admin_set_outlet_meal_cap($1, 150000)`, [OUTLET])).rejects.toThrow('Only headquarters');
    await db.exec(`SELECT set_config('test.admin', 'yes', false)`);
    await db.query(`SELECT public.admin_set_outlet_meal_cap($1, 150000)`, [OUTLET]);
    const { rows } = await db.query<{ c: number }>(`SELECT subscription_meal_cap_kobo AS c FROM public.outlets`);
    expect(Number(rows[0]?.c)).toBe(150000);
    const audit = await db.query(`SELECT * FROM public.audit_logs WHERE action='set_subscription_meal_cap'`);
    expect(audit.rows).toHaveLength(1);
    await expect(db.query(`SELECT public.admin_set_outlet_meal_cap($1, -1)`, [OUTLET])).rejects.toThrow('non-negative');
  });
});
