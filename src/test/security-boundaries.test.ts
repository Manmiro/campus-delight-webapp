// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const a = "00000000-0000-0000-0000-000000000001";
const b = "00000000-0000-0000-0000-000000000002";
const staff = "00000000-0000-0000-0000-000000000003";
const hq = "00000000-0000-0000-0000-000000000004";
const outlet = "00000000-0000-0000-0000-000000000010";
const menu = "00000000-0000-0000-0000-000000000020";
const scalar = async (sql: string, params: unknown[] = []) =>
  Object.values((await db.query<Record<string, unknown>>(sql, params)).rows[0]!)[0];
async function as<T>(
  role: "anon" | "authenticated" | "service_role",
  uid: string,
  fn: () => Promise<T>,
): Promise<T> {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]);
  await db.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
}
const user = <T>(id: string, fn: () => Promise<T>) => as("authenticated", id, fn);

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_user_meta_data jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner_id text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
    GRANT ALL ON storage.objects TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;`);
  const journal = JSON.parse(readFileSync("drizzle/migrations/meta/_journal.json", "utf8")) as {
    entries: { tag: string }[];
  };
  for (const entry of journal.entries)
    await db.exec(readFileSync(`drizzle/migrations/${entry.tag}.sql`, "utf8"));
  for (const name of ["meal_plan_caps", "security_privilege_hotfix", "security_boundaries"])
    await db.exec(readFileSync(`drizzle/proposed/${name}.sql`, "utf8"));
  await db.query("INSERT INTO outlets(id,name,code) VALUES($1,$2,$3)", [
    outlet,
    "Security Kitchen",
    "SECURE",
  ]);
  for (const [id, name] of [
    [a, "Alice"],
    [b, "Bob"],
    [staff, "Staff"],
    [hq, "Headquarters"],
  ]) {
    await db.query("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)", [
      id,
      `${name}@security-example.com`,
      { full_name: name, outlet_id: outlet },
    ]);
  }
  await db.query(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'outlet_staff'),($2,'central_admin')",
    [staff, hq],
  );
  await db.query(
    "INSERT INTO outlet_staff(user_id,outlet_id,staff_role) VALUES($1,$2,'outlet_staff')",
    [staff, outlet],
  );
  await db.query(
    "INSERT INTO menu_items(id,outlet_id,name,category,price_kobo) VALUES($1,$2,$3,$4,$5)",
    [menu, outlet, "Rice", "rice", 260000],
  );
  await db.query(
    "INSERT INTO outlet_plan_prices(outlet_id,plan,tier,price_kobo) VALUES($1,'weekly','basic',1800000),($1,'monthly','turbo',9000000)",
    [outlet],
  );
  await db.query(
    "INSERT INTO loans(customer_id,outlet_id,principal_kobo,charge_kobo,total_due_kobo,term_days,due_at,item_summary) VALUES($1,$2,100000,15000,115000,7,now()+interval '7 days','Private loan')",
    [b, outlet],
  );
}, 30000);
afterAll(async () => db.close());

async function pending(customer = b) {
  const result = await user(customer, () =>
    db.query<{ id: string }>(
      "INSERT INTO subscriptions(customer_id,outlet_id,plan,tier,price_kobo,status) VALUES($1,$2,'weekly','basic',1800000,'awaiting_payment') RETURNING id",
      [customer, outlet],
    ),
  );
  return result.rows[0]!.id;
}
const prepare = (id: string, ref: string) =>
  as("service_role", "", () =>
    db.query("SELECT prepare_subscription_payment($1,$2,$3)", [b, id, ref]),
  );
const settle = (ref: string) =>
  as("service_role", "", () =>
    db.query("SELECT settle_verified_payment($1,1800000,$2,$3) result", [
      ref,
      "NGN",
      { reference: ref, status: "success" },
    ]),
  );

describe("financial helper privileges", () => {
  it.each([
    "apply_wallet_refund(uuid,bigint,text,uuid)",
    "lock_referral_reward(uuid,uuid)",
    "unlock_referral_reward(uuid)",
    "activate_subscription(uuid,text)",
    "prepare_subscription_payment(uuid,uuid,text)",
    "settle_verified_payment(text,bigint,text,jsonb)",
    "consume_request_budget(text,integer,integer)",
  ])("keeps %s service-only", async (signature) => {
    for (const role of ["anon", "authenticated"])
      expect(
        await scalar("SELECT has_function_privilege($1,$2,'EXECUTE')", [role, signature]),
      ).toBe(false);
    expect(
      await scalar("SELECT has_function_privilege('service_role',$1,'EXECUTE')", [signature]),
    ).toBe(true);
  });
  it("rejects the original anonymous credit and referral exploits", async () => {
    await expect(
      as("anon", "", () =>
        db.query("SELECT apply_wallet_refund($1,100000,$2,NULL)", [a, "FORGED"]),
      ),
    ).rejects.toThrow("permission denied");
    await expect(
      as("anon", "", () => db.query("SELECT lock_referral_reward($1,$2)", [a, b])),
    ).rejects.toThrow("permission denied");
    await expect(
      as("anon", "", () => db.query("SELECT unlock_referral_reward($1)", [b])),
    ).rejects.toThrow("permission denied");
    expect(Number(await scalar("SELECT balance_kobo FROM wallets WHERE customer_id=$1", [a]))).toBe(
      0,
    );
  });
});

describe("database authorization boundaries", () => {
  it("ordinary outlet customers cannot read peers loans or subscriptions; assigned staff can", async () => {
    const id = await pending();
    expect(
      Number(await user(a, () => scalar("SELECT count(*) FROM loans WHERE customer_id=$1", [b]))),
    ).toBe(0);
    expect(
      Number(await user(a, () => scalar("SELECT count(*) FROM subscriptions WHERE id=$1", [id]))),
    ).toBe(0);
    expect(
      Number(
        await user(staff, () => scalar("SELECT count(*) FROM loans WHERE customer_id=$1", [b])),
      ),
    ).toBe(1);
    expect(
      Number(
        await user(staff, () => scalar("SELECT count(*) FROM subscriptions WHERE id=$1", [id])),
      ),
    ).toBe(1);
  });
  it("frozen users cannot invoke financial RPCs or bypass freezes through table reads", async () => {
    await db.query("UPDATE profiles SET is_active=false WHERE id=$1", [a]);
    try {
      await expect(user(a, () => db.query("SELECT claim_daily_checkin()"))).rejects.toThrow(
        "Account is frozen",
      );
      await expect(
        user(a, () =>
          db.query("SELECT place_order_with_fulfillment($1,'cash_wallet','pickup')", [
            [{ menu_item_id: menu, quantity: 1 }],
          ]),
        ),
      ).rejects.toThrow("Account is frozen");
      expect(Number(await user(a, () => scalar("SELECT count(*) FROM wallets")))).toBe(0);
      expect(Number(await user(a, () => scalar("SELECT count(*) FROM token_accounts")))).toBe(0);
      expect(
        Number(await user(a, () => scalar("SELECT count(*) FROM profiles WHERE id=$1", [a]))),
      ).toBe(1);
    } finally {
      await db.query("UPDATE profiles SET is_active=true WHERE id=$1", [a]);
    }
  });
  it("a frozen HQ account cannot unfreeze itself with an existing JWT", async () => {
    await db.query("UPDATE profiles SET is_active=false WHERE id=$1", [hq]);
    try {
      expect(await user(hq, () => scalar("SELECT is_central_admin()"))).toBe(false);
      await expect(
        user(hq, () => db.query("SELECT admin_set_account_status($1,true,$2)", [hq, "Bypass"])),
      ).rejects.toThrow("Account is frozen");
    } finally {
      await db.query("UPDATE profiles SET is_active=true WHERE id=$1", [hq]);
    }
  });
  it("pending subscription terms cannot be changed by a customer or staff browser", async () => {
    const id = await pending();
    for (const actor of [b, staff])
      await expect(
        user(actor, () =>
          db.query(
            "UPDATE subscriptions SET plan='monthly',tier='turbo',price_kobo=1 WHERE id=$1",
            [id],
          ),
        ),
      ).rejects.toThrow("permission denied");
    await expect(
      user(b, () =>
        db.query(
          "INSERT INTO subscriptions(customer_id,outlet_id,plan,tier,price_kobo,payment_reference) VALUES($1,$2,'weekly','basic',1,'FORGED')",
          [b, outlet],
        ),
      ),
    ).rejects.toThrow("permission denied");
  });
});

describe("immutable payment quotes and legacy checkout", () => {
  it("valid online checkout still activates the exact quoted plan once", async () => {
    const id = await pending();
    const ref = `CDPS-${crypto.randomUUID()}`;
    await prepare(id, ref);
    await settle(ref);
    await settle(ref);
    expect(
      (await db.query("SELECT plan,tier,status FROM subscriptions WHERE id=$1", [id])).rows[0],
    ).toEqual({ plan: "weekly", tier: "basic", status: "active" });
    expect(
      Number(await scalar("SELECT count(*) FROM meal_entitlements WHERE subscription_id=$1", [id])),
    ).toBe(7);
  });
  it("changed plan terms cannot turn a cheap verified payment into a costly plan; funds are credited once", async () => {
    const id = await pending();
    const ref = `CDPS-${crypto.randomUUID()}`;
    await prepare(id, ref);
    await db.query("UPDATE subscriptions SET plan='monthly',tier='turbo' WHERE id=$1", [id]);
    const before = Number(
      await scalar("SELECT balance_kobo FROM wallets WHERE customer_id=$1", [b]),
    );
    await settle(ref);
    await settle(ref);
    expect(
      Number(await scalar("SELECT count(*) FROM meal_entitlements WHERE subscription_id=$1", [id])),
    ).toBe(0);
    const balance = Number(
      await scalar("SELECT balance_kobo FROM wallets WHERE customer_id=$1", [b]),
    );
    const autoRepaid = Number(
      await scalar(
        "SELECT coalesce(sum(amount_kobo),0) FROM loan_repayments WHERE reference LIKE $1",
        [`AUTO-${ref}-%`],
      ),
    );
    expect(balance - before + autoRepaid).toBe(1800000);
    expect(
      Number(
        await scalar(
          "SELECT count(*) FROM wallet_ledger WHERE reference=$1 AND tx_type='funding'",
          [ref],
        ),
      ),
    ).toBe(1);
  });
  it("historical pending payments without snapshots preserve settlement and reject upgrades", async () => {
    const id = await pending();
    const ref = `CDPS-${crypto.randomUUID()}`;
    await prepare(id, ref);
    await db.query(
      "UPDATE payment_transactions SET checkout_snapshot=NULL WHERE paystack_reference=$1",
      [ref],
    );
    await db.query("UPDATE subscriptions SET plan='monthly',tier='turbo' WHERE id=$1", [id]);
    await settle(ref);
    expect(
      Number(await scalar("SELECT count(*) FROM meal_entitlements WHERE subscription_id=$1", [id])),
    ).toBe(0);
    expect(
      Number(
        await scalar(
          "SELECT count(*) FROM wallet_ledger WHERE reference=$1 AND tx_type='funding'",
          [ref],
        ),
      ),
    ).toBe(1);
  });
  it("legacy pickup enforces the cap, and legitimate staff cancellation refunds the original co-pay once", async () => {
    const id = await pending(a);
    await db.query("UPDATE subscriptions SET status='active' WHERE id=$1", [id]);
    await db.query(
      "INSERT INTO meal_entitlements(subscription_id,customer_id,service_date,allowance) VALUES($1,$2,(now() AT TIME ZONE 'Africa/Lagos')::date,1)",
      [id, a],
    );
    await db.query("UPDATE wallets SET balance_kobo=60000 WHERE customer_id=$1", [a]);
    const result = await user(a, () =>
      db.query<{ result: { order_id: string; total_kobo: number } }>(
        "SELECT place_order($1,'subscription_entitlement',$2) result",
        [[{ menu_item_id: menu, quantity: 1 }], id],
      ),
    );
    expect(result.rows[0]!.result.total_kobo).toBe(60000);
    await user(staff, () => db.query("SELECT cancel_order($1)", [result.rows[0]!.result.order_id]));
    await expect(
      user(staff, () => db.query("SELECT cancel_order($1)", [result.rows[0]!.result.order_id])),
    ).rejects.toThrow("Only confirmed orders");
    expect(Number(await scalar("SELECT balance_kobo FROM wallets WHERE customer_id=$1", [a]))).toBe(
      60000,
    );
    expect(
      Number(await scalar("SELECT redeemed FROM meal_entitlements WHERE subscription_id=$1", [id])),
    ).toBe(0);
  });
  it("rate-limit budgets persist across requests and reset only after their window", async () => {
    const key = "a".repeat(64);
    const budget = () =>
      as("service_role", "", () => scalar("SELECT consume_request_budget($1,2,60)", [key]));
    expect(await budget()).toBe(true);
    expect(await budget()).toBe(true);
    expect(await budget()).toBe(false);
    await db.query(
      "UPDATE request_rate_limits SET window_started_at=now()-interval '61 seconds' WHERE key_hash=$1",
      [key],
    );
    expect(await budget()).toBe(true);
  });
});
