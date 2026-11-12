// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const customer = "00000000-0000-0000-0000-000000000001";
const outlet = "00000000-0000-0000-0000-000000000002";
const subscription = "00000000-0000-0000-0000-000000000003";
const menu = "00000000-0000-0000-0000-000000000004";
const hq = "00000000-0000-0000-0000-000000000099";
const sql = (name: string) => readFileSync(`drizzle/migrations/${name}`, "utf8");
const extract = (source: string, name: string) => {
  const start = source.toLowerCase().indexOf(`create or replace function public.${name}(`);
  return source.slice(
    start,
    source.indexOf("$$;", source.toLowerCase().indexOf("as $$", start)) + 3,
  );
};
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION is_central_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT auth.uid()='${hq}'::uuid $$;
    CREATE FUNCTION is_outlet_staff(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION is_outlet_manager(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION unlock_referral_reward(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE TABLE outlets(id uuid PRIMARY KEY, name text, code text UNIQUE, location text, address text, contact_phone text, contact_email text, status text DEFAULT 'active');
    GRANT SELECT ON outlets TO authenticated;
    GRANT UPDATE(contact_phone,contact_email,address) ON outlets TO authenticated;
    CREATE TABLE profiles(id uuid PRIMARY KEY, outlet_id uuid, created_at timestamptz DEFAULT now()-interval '2 days', verification_status text DEFAULT 'verified');
    CREATE TABLE wallets(customer_id uuid PRIMARY KEY, balance_kobo bigint NOT NULL CHECK(balance_kobo>=0), updated_at timestamptz);
    CREATE TABLE wallet_ledger(id uuid DEFAULT gen_random_uuid(), customer_id uuid, tx_type text, amount_kobo bigint, balance_after_kobo bigint, reference text UNIQUE, description text, related_order_id uuid);
    CREATE TABLE subscriptions(id uuid PRIMARY KEY, customer_id uuid, outlet_id uuid, status text);
    CREATE TABLE meal_entitlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid, customer_id uuid, service_date date, allowance integer DEFAULT 2, redeemed integer DEFAULT 0 CHECK(redeemed>=0 AND redeemed<=allowance));
    CREATE TABLE menu_items(id uuid PRIMARY KEY, outlet_id uuid, name text, price_kobo bigint, is_available boolean DEFAULT true, is_credit_eligible boolean DEFAULT true);
    CREATE TABLE orders(id uuid PRIMARY KEY, customer_id uuid, outlet_id uuid, payment_method text, total_kobo bigint, tokens_used bigint, subscription_id uuid, loan_id uuid, status text, reference text UNIQUE, created_at timestamptz DEFAULT now());
    CREATE TABLE order_items(order_id uuid REFERENCES orders(id), menu_item_id uuid, item_name text, unit_price_kobo bigint, quantity integer);
    CREATE TABLE notifications(customer_id uuid,title text,body text);
    CREATE TABLE audit_logs(actor_id uuid,action text,entity text,entity_id text,details jsonb);
    CREATE TABLE token_accounts(customer_id uuid PRIMARY KEY,available_tokens bigint,locked_tokens bigint,updated_at timestamptz);
    CREATE TABLE token_ledger(customer_id uuid,tx_type text,amount bigint,to_available bigint,available_after bigint,locked_after bigint,reference text,description text);
    CREATE TABLE loans(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id uuid,outlet_id uuid,principal_kobo bigint,charge_kobo bigint,total_due_kobo bigint,term_days integer,due_at timestamptz,status text,item_summary text);
    CREATE TABLE customer_credit(customer_id uuid PRIMARY KEY,credit_limit_kobo bigint DEFAULT 5000000,outstanding_kobo bigint DEFAULT 0,updated_at timestamptz);`);
  await db.exec(sql("0022_delivery_pickup_checkout.sql"));
  await db.exec(extract(sql("0007_order_fulfillment_rpcs_and_grants.sql"), "apply_wallet_refund"));
  await db.exec(extract(sql("0009_paystack_card_checkout.sql"), "cancel_order"));
  await db.exec(
    `CREATE TABLE loan_restriction_exceptions(loan_id uuid PRIMARY KEY,ordering_restored boolean DEFAULT false);`,
  );
  await db.exec(
    extract(sql("0040_hq_overdue_restriction_exceptions.sql"), "enforce_overdue_order_lock"),
  );
  await db.exec(
    "CREATE TRIGGER enforce_overdue_order_lock BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION enforce_overdue_order_lock()",
  );
  await db.exec(readFileSync("drizzle/proposed/meal_plan_caps.sql", "utf8"));
}, 30000);
afterAll(async () => db.close());
beforeEach(async () => {
  await db.exec(`TRUNCATE outlets,profiles,wallets,wallet_ledger,subscriptions,meal_entitlements,menu_items,orders,order_items,notifications,audit_logs,token_accounts,token_ledger,loans,customer_credit CASCADE;
    SELECT set_config('test.uid','${customer}',false);
    INSERT INTO outlets(id,name,code) VALUES('${outlet}','Campus','CAMPUS');
    INSERT INTO profiles(id,outlet_id) VALUES('${customer}','${outlet}');
    INSERT INTO wallets VALUES('${customer}',500000,now());
    INSERT INTO token_accounts VALUES('${customer}',5000,0,now());
    INSERT INTO subscriptions VALUES('${subscription}','${customer}','${outlet}','active');
    INSERT INTO meal_entitlements(subscription_id,customer_id,service_date) VALUES('${subscription}','${customer}',(now() AT TIME ZONE 'Africa/Lagos')::date);
    INSERT INTO menu_items(id,outlet_id,name,price_kobo) VALUES('${menu}','${outlet}','Rice',260000);`);
});

const identity = (id: string) => db.query("SELECT set_config('test.uid',$1,false)", [id]);
const checkout = (
  fulfillment = "delivery",
  cap: number | null = 200000,
  method = "subscription_entitlement",
) =>
  db.query<{ result: Record<string, number | string> }>(
    "SELECT place_order_with_fulfillment($1,$2,$3,$4,$5,$6,NULL,$7) result",
    [
      [{ menu_item_id: menu, quantity: 1, price_kobo: 1 }],
      method,
      fulfillment,
      "Hostel A room 5",
      60000,
      subscription,
      cap,
    ],
  );
const state = async () =>
  (
    await db.query<{
      balance: number;
      redeemed: number;
      orders: number;
      debits: number;
      notices: number;
    }>(`SELECT
  (SELECT balance_kobo FROM wallets) balance, (SELECT redeemed FROM meal_entitlements) redeemed,
  (SELECT count(*)::integer FROM orders) orders,(SELECT count(*)::integer FROM wallet_ledger) debits,
  (SELECT count(*)::integer FROM notifications) notices`)
  ).rows[0];
const adminUpdate = (patch: Record<string, unknown>) =>
  db.query("SELECT admin_update_outlet_details($1,$2)", [outlet, patch]);

describe("atomic meal cap checkout", () => {
  it.each([
    [150000, "delivery", 60000, 150000, 0],
    [200000, "delivery", 60000, 200000, 0],
    [260000, "delivery", 120000, 200000, 60000],
    [150000, "pickup", 0, 150000, 0],
    [200000, "pickup", 0, 200000, 0],
    [260000, "pickup", 60000, 200000, 60000],
  ])(
    "food %i with %s debits %i and consumes one entitlement",
    async (food, fulfillment, debit, covered, copay) => {
      await db.query("UPDATE menu_items SET price_kobo=$1", [food]);
      const result = (await checkout(fulfillment)).rows[0]!.result;
      expect(result).toMatchObject({
        total_kobo: debit,
        meal_plan_covered_kobo: covered,
        meal_copay_kobo: copay,
        food_kobo: food,
      });
      expect(await state()).toMatchObject({
        balance: 500000 - debit,
        redeemed: 1,
        orders: 1,
        debits: debit ? 1 : 0,
        notices: 1,
      });
      expect(
        (await db.query("SELECT meal_cap_kobo,meal_plan_covered_kobo,meal_copay_kobo FROM orders"))
          .rows[0],
      ).toEqual({ meal_cap_kobo: 200000, meal_plan_covered_kobo: covered, meal_copay_kobo: copay });
      if (debit)
        expect(
          (await db.query("SELECT amount_kobo,related_order_id FROM wallet_ledger")).rows[0],
        ).toEqual({ amount_kobo: -debit, related_order_id: result["order_id"] });
    },
  );
  it("accepts the exact combined balance", async () => {
    await db.exec("UPDATE wallets SET balance_kobo=120000");
    await checkout();
    expect(await state()).toMatchObject({ balance: 0, redeemed: 1 });
  });
  it("rejects a one-kobo shortfall with the exact required message and no mutations", async () => {
    await db.exec("UPDATE wallets SET balance_kobo=119999");
    await expect(checkout()).rejects.toThrow(
      "Your cash wallet needs ₦1,200 to cover the meal co-pay and delivery fee. Please top up your wallet to complete this order.",
    );
    expect(await state()).toEqual({
      balance: 119999,
      redeemed: 0,
      orders: 0,
      debits: 0,
      notices: 0,
    });
  });
  it("formats fractional naira accurately in insufficient-funds errors", async () => {
    await db.exec("UPDATE menu_items SET price_kobo=260025; UPDATE wallets SET balance_kobo=0");
    await expect(checkout()).rejects.toThrow("₦1,200.25");
  });
  it("under-cap pickup succeeds with an empty wallet", async () => {
    await db.exec("UPDATE wallets SET balance_kobo=0; UPDATE menu_items SET price_kobo=150000");
    await checkout("pickup");
    expect(await state()).toMatchObject({ balance: 0, redeemed: 1, debits: 0 });
  });
  it.each([null, 199999, 250000])(
    "rejects a missing or stale cap quote %s without charging",
    async (cap) => {
      await expect(checkout("delivery", cap)).rejects.toThrow("meal cap changed");
      expect(await state()).toMatchObject({ balance: 500000, redeemed: 0, orders: 0, debits: 0 });
    },
  );
  it("validates the delivery quote independently of the meal cap", async () => {
    await db.exec("UPDATE outlets SET delivery_fee_kobo=70000");
    await expect(checkout()).rejects.toThrow("delivery fee changed");
    expect(await state()).toMatchObject({ redeemed: 0, debits: 0 });
  });
  it("rolls back the debit and entitlement when order insertion fails", async () => {
    await db.exec(`CREATE FUNCTION reject_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Order failed'; END $$;
      CREATE TRIGGER reject_order BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION reject_order();`);
    try {
      await expect(checkout()).rejects.toThrow("Order failed");
      expect(await state()).toEqual({
        balance: 500000,
        redeemed: 0,
        orders: 0,
        debits: 0,
        notices: 0,
      });
    } finally {
      await db.exec("DROP TRIGGER reject_order ON orders; DROP FUNCTION reject_order()");
    }
  });
  it("rejects exhausted entitlements before debiting", async () => {
    await db.exec("UPDATE meal_entitlements SET redeemed=allowance");
    await expect(checkout()).rejects.toThrow("No meals left today");
    expect(await state()).toMatchObject({ balance: 500000, redeemed: 2, orders: 0, debits: 0 });
  });
  it("requires an active subscription belonging to this customer and outlet", async () => {
    await db.exec(`UPDATE subscriptions SET customer_id='${hq}'`);
    await expect(checkout()).rejects.toThrow("Active subscription at this outlet required");
    expect(await state()).toMatchObject({ redeemed: 0, debits: 0 });
  });
  it("legacy pickup callers cannot bypass the cap", async () => {
    await db.query("SELECT place_order($1,$2,$3)", [
      [{ menu_item_id: menu, quantity: 1 }],
      "subscription_entitlement",
      subscription,
    ]);
    expect(await state()).toMatchObject({ balance: 440000, redeemed: 1, debits: 1 });
  });
  it.each(["cash_wallet", "tokens"])(
    "preserves %s food and delivery charges without using an entitlement",
    async (method) => {
      expect((await checkout("delivery", null, method)).rows[0]!.result).toMatchObject({
        total_kobo: 320000,
        meal_copay_kobo: 0,
        meal_plan_covered_kobo: 0,
      });
      expect(await state()).toMatchObject({
        redeemed: 0,
        balance: method === "cash_wallet" ? 180000 : 500000,
      });
      if (method === "tokens")
        expect((await db.query("SELECT available_tokens FROM token_accounts")).rows[0]).toEqual({
          available_tokens: 1800,
        });
    },
  );
  it("preserves Pay Later pricing, delivery and item descriptions", async () => {
    await db.query("SELECT place_order_with_fulfillment($1,$2,$3,$4,$5,NULL,7)", [
      [{ menu_item_id: menu, quantity: 1 }],
      "food_credit",
      "delivery",
      "Hostel A room 5",
      60000,
    ]);
    expect(
      (await db.query("SELECT principal_kobo,charge_kobo,total_due_kobo,item_summary FROM loans"))
        .rows[0],
    ).toEqual({
      principal_kobo: 320000,
      charge_kobo: 48000,
      total_due_kobo: 368000,
      item_summary: "Rice x1",
    });
    expect(await state()).toMatchObject({ balance: 500000, redeemed: 0, debits: 0 });
  });
  it("preserves overdue enforcement while allowing capped subscription meals", async () => {
    await db.exec(
      `INSERT INTO loans(customer_id,status,due_at) VALUES('${customer}','overdue',now()-interval '4 days')`,
    );
    await expect(checkout("delivery", null, "cash_wallet")).rejects.toThrow(
      "Ordering is paused due to overdue debt",
    );
    expect(await state()).toMatchObject({ balance: 500000, redeemed: 0, orders: 0, debits: 0 });
    await checkout();
    expect(await state()).toMatchObject({ balance: 380000, redeemed: 1, orders: 1, debits: 1 });
  });
});

describe("subscription order cancellations", () => {
  it.each(["delivery", "pickup"])(
    "refunds the full committed %s debit and restores one meal exactly once",
    async (fulfillment) => {
      const order = (await checkout(fulfillment)).rows[0]!.result;
      await identity(hq);
      // Later cap edits must not affect the refund for an existing order.
      await adminUpdate({ meal_cap_kobo: 300000 });
      await db.query("SELECT cancel_order($1)", [order["order_id"]]);
      await expect(db.query("SELECT cancel_order($1)", [order["order_id"]])).rejects.toThrow(
        "Only confirmed orders",
      );
      expect(await state()).toMatchObject({ balance: 500000, redeemed: 0, debits: 2 });
      expect(
        (await db.query("SELECT amount_kobo FROM wallet_ledger WHERE tx_type='refund'")).rows[0],
      ).toEqual({ amount_kobo: order["total_kobo"] });
    },
  );
  it("keeps historical subscription delivery refunds working", async () => {
    await db.exec(`INSERT INTO orders(id,customer_id,outlet_id,payment_method,total_kobo,status,reference,delivery_fee_kobo) VALUES(gen_random_uuid(),'${customer}','${outlet}','subscription_entitlement',60000,'confirmed','OLD',60000);
      UPDATE wallets SET balance_kobo=440000;`);
    await identity(hq);
    await db.exec("SELECT cancel_order(id) FROM orders WHERE reference='OLD'");
    expect(await state()).toMatchObject({ balance: 500000, debits: 1 });
  });
});

describe("HQ outlet cap edits", () => {
  it("saves contact details and cap together with authenticated actor and previous/new values", async () => {
    await identity(hq);
    await adminUpdate({
      meal_cap_kobo: 250000,
      address: "New address",
      contact_email: "hq@example.com",
    });
    expect(
      (await db.query("SELECT meal_cap_kobo,address,contact_email FROM outlets")).rows[0],
    ).toEqual({ meal_cap_kobo: 250000, address: "New address", contact_email: "hq@example.com" });
    expect(
      (
        await db.query(
          "SELECT actor_id,entity_id,details FROM audit_logs WHERE action='set_meal_cap'",
        )
      ).rows,
    ).toEqual([
      {
        actor_id: hq,
        entity_id: outlet,
        details: { outlet_id: outlet, previous_cap_kobo: 200000, new_cap_kobo: 250000 },
      },
    ]);
  });
  it("only records cap changes when the cap differs", async () => {
    await identity(hq);
    await adminUpdate({ meal_cap_kobo: 200000 });
    expect(
      (await db.query("SELECT * FROM audit_logs WHERE action='set_meal_cap'")).rows,
    ).toHaveLength(0);
  });
  it("rejects non-HQ and unauthenticated edits", async () => {
    await expect(adminUpdate({ meal_cap_kobo: 300000 })).rejects.toThrow(
      "central administrators only",
    );
    await identity("");
    await expect(adminUpdate({ meal_cap_kobo: 300000 })).rejects.toThrow(
      "central administrators only",
    );
    expect((await db.query("SELECT meal_cap_kobo FROM outlets")).rows[0]).toEqual({
      meal_cap_kobo: 200000,
    });
  });
  it.each([null, 0, -1, 1.5, "200000", 9007199254740992])(
    "rejects invalid cap %s in the database",
    async (cap) => {
      await identity(hq);
      await expect(adminUpdate({ meal_cap_kobo: cap })).rejects.toThrow("valid positive meal cap");
    },
  );
  it("rolls back both details and cap if audit insertion fails", async () => {
    await identity(hq);
    await db.exec(`CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit failed'; END $$;
      CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit();`);
    try {
      await expect(adminUpdate({ meal_cap_kobo: 250000, address: "New address" })).rejects.toThrow(
        "Audit failed",
      );
      expect((await db.query("SELECT meal_cap_kobo,address FROM outlets")).rows[0]).toEqual({
        meal_cap_kobo: 200000,
        address: null,
      });
    } finally {
      await db.exec("DROP TRIGGER reject_audit ON audit_logs; DROP FUNCTION reject_audit()");
    }
  });
  it("does not grant browser roles direct cap updates or anonymous access to the RPCs", async () => {
    expect(
      (
        await db.query(
          "SELECT has_column_privilege('authenticated','outlets','meal_cap_kobo','UPDATE') allowed",
        )
      ).rows[0],
    ).toEqual({ allowed: false });
    for (const signature of [
      "admin_update_outlet_details(uuid,jsonb)",
      "place_order_with_fulfillment(jsonb,text,text,text,bigint,uuid,integer,bigint)",
      "place_order(jsonb,text,uuid,integer)",
    ]) {
      expect(
        (await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') allowed", [signature]))
          .rows[0],
      ).toEqual({ allowed: false });
    }
  });
});
