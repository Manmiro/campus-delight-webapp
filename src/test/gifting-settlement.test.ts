// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const customer = "00000000-0000-0000-0000-000000000001";
const outlet = "00000000-0000-0000-0000-000000000002";
const menu = "00000000-0000-0000-0000-000000000003";
const other = "00000000-0000-0000-0000-000000000004";
const reference = "CDG-00000000-0000-0000-0000-000000000005";
const read = (file: string) => readFileSync(`drizzle/migrations/${file}`, "utf8");
const fn = (source: string, name: string) => {
  const start = source.toLowerCase().indexOf(`create or replace function public.${name}(`);
  return source.slice(
    start,
    source.indexOf("$$;", source.toLowerCase().indexOf("as $$", start)) + 3,
  );
};
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE profiles(id uuid PRIMARY KEY,customer_code text,is_active boolean DEFAULT true,outlet_id uuid);
    CREATE TABLE user_roles(user_id uuid,role text);
    CREATE TABLE outlets(id uuid PRIMARY KEY,status text DEFAULT 'active',delivery_fee_kobo bigint DEFAULT 60000);
    CREATE TABLE wallets(customer_id uuid PRIMARY KEY,balance_kobo bigint DEFAULT 0,updated_at timestamptz);
    CREATE TABLE notifications(customer_id uuid,title text,body text);
    CREATE TABLE loans(id uuid,customer_id uuid,status text,due_at timestamptz,created_at timestamptz);
    CREATE TABLE loan_restriction_exceptions(loan_id uuid,ordering_restored boolean);
    CREATE FUNCTION unlock_referral_reward(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;`);
  for (const [file, end] of [
    ["0002_subscriptions_pricing_entitlements.sql", "alter table"],
    ["0001_ledgers_transfers_referrals_otp_config.sql", "create table public.token_transfers"],
    ["0003_menus_orders_payments.sql", "create table public.payment_transactions"],
  ]) {
    const source = read(file!);
    await db.exec(source.slice(0, source.indexOf(end!)));
  }
  await db.exec(`ALTER TABLE orders DROP CONSTRAINT orders_payment_method_check;
    ALTER TABLE orders ADD COLUMN fulfillment_method text,ADD COLUMN delivery_fee_kobo bigint,ADD COLUMN delivery_address text;`);
  await db.exec(fn(read("0039_automated_overdue_loans.sql"), "apply_wallet_funding"));
  await db.exec(
    fn(read("0040_hq_overdue_restriction_exceptions.sql"), "enforce_overdue_order_lock"),
  );
  await db.exec(
    `CREATE TRIGGER enforce_overdue_order_lock BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION enforce_overdue_order_lock();`,
  );
  await db.exec(readFileSync("drizzle/proposed/feed_someone.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec(`TRUNCATE gift_payments,orders,order_items,subscriptions,meal_entitlements,outlet_plan_prices,menu_items,profiles,outlets,wallets,wallet_ledger,user_roles,notifications,loans CASCADE;
    INSERT INTO outlets(id) VALUES('${outlet}'),('${other}');
    INSERT INTO profiles VALUES('${customer}','CD050619',true,'${outlet}');
    INSERT INTO user_roles VALUES('${customer}','customer');
    INSERT INTO wallets(customer_id,balance_kobo) VALUES('${customer}',10000);
    INSERT INTO menu_items(id,outlet_id,name,price_kobo) VALUES('${menu}','${outlet}','Jollof and chicken',200000);
    INSERT INTO outlet_plan_prices(outlet_id,plan,tier,price_kobo) VALUES('${outlet}','weekly','standard',1800000),('${outlet}','weekend','basic',900000),('${outlet}','monthly','turbo',9000000);`);
});
afterAll(async () => db.close());
const prepare = (overrides: Record<string, unknown> = {}, ref = reference) =>
  db.query("SELECT prepare_gift_payment($1,$2)", [
    ref,
    {
      foodieId: "CD050619",
      outletId: outlet,
      kind: "wallet",
      expectedAmountKobo: 200000,
      sponsorName: "Mum",
      sponsorEmail: "mum@example.com",
      note: "Good luck ❤️",
      ...overrides,
    },
  ]);
const settle = (amount = 200000, currency = "NGN", status = "success", ref = reference) =>
  db.query<{
    result: { applied: boolean; already: boolean; status: string; walletFallback: boolean };
  }>("SELECT settle_verified_gift($1,$2,$3,$4) result", [
    reference,
    amount,
    currency,
    { status, reference: ref },
  ]);
const rows = async (table: string) =>
  (await db.query<Record<string, unknown>>(`SELECT * FROM ${table}`)).rows;

describe("guest gift settlement", () => {
  it("credits a wallet once across simultaneous retry requests, preserving the personal notification", async () => {
    await prepare();
    const results = await Promise.all([settle(), settle(), settle()]);
    expect(results.map((r) => r.rows[0]!.result.already)).toEqual([false, true, true]);
    expect((await rows("wallets"))[0]?.["balance_kobo"]).toBe(210000);
    expect(await rows("wallet_ledger")).toHaveLength(1);
    expect(
      (await rows("notifications")).some((r) => String(r["body"]).includes("Good luck ❤️")),
    ).toBe(true);
  });
  it.each([
    [200001, "NGN", "success", reference],
    [200000, "USD", "success", reference],
    [200000, "NGN", "failed", reference],
    [200000, "NGN", "success", "other"],
  ] as const)(
    "rejects mismatched amount, currency, status or reference (%s, %s, %s)",
    async (amount, currency, status, ref) => {
      await prepare();
      expect((await settle(amount, currency, status, ref)).rows[0]!.result).toMatchObject({
        applied: false,
        status: "verification_mismatch",
      });
      expect(await rows("wallet_ledger")).toHaveLength(0);
      expect((await rows("gift_payments"))[0]?.["status"]).toBe("pending");
    },
  );
  it("rejects inactive, noncustomer and reassigned recipients before taking payment", async () => {
    await expect(prepare({ outletId: other })).rejects.toThrow("outlet changed");
    await db.exec("DELETE FROM user_roles");
    await expect(prepare()).rejects.toThrow("Recipient not available");
    await db.exec(
      `INSERT INTO user_roles VALUES('${customer}','customer'); UPDATE profiles SET is_active=false;`,
    );
    await expect(prepare()).rejects.toThrow("Recipient not available");
    expect(await rows("gift_payments")).toHaveLength(0);
  });
  it("validates live plan prices and creates daily entitlements exactly once", async () => {
    await expect(prepare({ kind: "plan", plan: "weekly", tier: "standard" })).rejects.toThrow(
      "Price changed",
    );
    await prepare({ kind: "plan", plan: "weekly", tier: "standard", expectedAmountKobo: 1800000 });
    await db.exec("UPDATE outlet_plan_prices SET price_kobo=9999999");
    await settle(1800000);
    await settle(1800000);
    expect(await rows("subscriptions")).toHaveLength(1);
    const entitlements = await rows("meal_entitlements");
    expect(entitlements).toHaveLength(7);
    expect(entitlements.every((r) => r["allowance"] === 2)).toBe(true);
    expect(await rows("wallet_ledger")).toHaveLength(0);
  });
  it("creates Friday–Sunday weekend entitlements with the selected tier", async () => {
    await prepare({ kind: "plan", plan: "weekend", tier: "basic", expectedAmountKobo: 900000 });
    await settle(900000);
    const days = await db.query<{ dow: number; allowance: number }>(
      "SELECT extract(dow FROM service_date)::int dow,allowance FROM meal_entitlements ORDER BY service_date",
    );
    expect(days.rows).toEqual([
      { dow: 5, allowance: 1 },
      { dow: 6, allowance: 1 },
      { dow: 0, allowance: 1 },
    ]);
  });
  it("ends monthly service on the last day of the current Lagos calendar month", async () => {
    await prepare({ kind: "plan", plan: "monthly", tier: "turbo", expectedAmountKobo: 9000000 });
    await settle(9000000);
    const result = await db.query<{ correct: boolean }>(
      `SELECT start_date=(now() AT TIME ZONE 'Africa/Lagos')::date AND end_date=(date_trunc('month',now() AT TIME ZONE 'Africa/Lagos')+interval '1 month - 1 day')::date correct FROM subscriptions`,
    );
    expect(result.rows[0]!.correct).toBe(true);
    expect((await rows("meal_entitlements")).every((r) => r["allowance"] === 3)).toBe(true);
  });
  it("snapshots meal and delivery prices and creates one confirmed kitchen order", async () => {
    const choice = {
      kind: "meal",
      menuItemId: menu,
      fulfillment: "delivery",
      address: "Hostel A room 12",
    };
    await expect(prepare(choice)).rejects.toThrow("Price changed");
    await prepare({ ...choice, expectedAmountKobo: 260000 });
    expect(await rows("orders")).toHaveLength(0);
    await db.exec(
      "UPDATE outlets SET delivery_fee_kobo=100000; UPDATE menu_items SET price_kobo=900000;",
    );
    await settle(260000);
    await settle(260000);
    expect(await rows("orders")).toHaveLength(1);
    expect((await rows("orders"))[0]).toMatchObject({
      status: "confirmed",
      reference,
      total_kobo: 260000,
      delivery_fee_kobo: 60000,
      fulfillment_method: "delivery",
      delivery_address: "Hostel A room 12",
    });
    expect((await rows("order_items"))[0]).toMatchObject({
      item_name: "Jollof and chicken",
      unit_price_kobo: 200000,
      quantity: 1,
    });
  });
  it("rejects cross-outlet meals and missing delivery addresses", async () => {
    await db.exec(`UPDATE menu_items SET outlet_id='${other}'`);
    await expect(
      prepare({ kind: "meal", menuItemId: menu, fulfillment: "pickup" }),
    ).rejects.toThrow("Meal is unavailable");
    await db.exec(`UPDATE menu_items SET outlet_id='${outlet}'`);
    await expect(
      prepare({ kind: "meal", menuItemId: menu, fulfillment: "delivery" }),
    ).rejects.toThrow("delivery address");
  });
  it("preserves paid funds when a meal sells out, with no duplicate credit", async () => {
    await prepare({ kind: "meal", menuItemId: menu, fulfillment: "pickup" });
    await db.exec("UPDATE menu_items SET is_available=false");
    expect((await settle()).rows[0]!.result.walletFallback).toBe(true);
    await settle();
    expect(await rows("orders")).toHaveLength(0);
    expect(await rows("wallet_ledger")).toHaveLength(1);
  });
  it("respects loan restriction triggers and credits the wallet instead of bypassing them", async () => {
    await prepare({ kind: "meal", menuItemId: menu, fulfillment: "pickup" });
    // A settled/cancelled loan has no outstanding balance for apply_wallet_funding;
    // this test injects the same restriction failure to verify the atomic fallback.
    await db.exec(
      `CREATE OR REPLACE FUNCTION public.enforce_overdue_order_lock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Ordering is paused due to overdue debt'; END; $$;`,
    );
    expect((await settle()).rows[0]!.result.walletFallback).toBe(true);
    expect(await rows("orders")).toHaveLength(0);
    expect(await rows("order_items")).toHaveLength(0);
    expect(await rows("wallet_ledger")).toHaveLength(1);
    await db.exec(
      fn(read("0040_hq_overdue_restriction_exceptions.sql"), "enforce_overdue_order_lock"),
    );
  });
  it("keeps sponsor details and financial RPCs service-only", async () => {
    await prepare();
    await db.exec("SET ROLE anon");
    await expect(db.query("SELECT * FROM gift_payments")).rejects.toThrow("permission denied");
    await expect(prepare()).rejects.toThrow("permission denied");
    await expect(settle()).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE; SET ROLE authenticated");
    await expect(db.query("SELECT * FROM gift_payments")).rejects.toThrow("permission denied");
    await expect(settle()).rejects.toThrow("permission denied");
    await db.exec("RESET ROLE");
  });
});
