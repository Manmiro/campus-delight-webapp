// Local-only security reproductions. Never connects to the hosted database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const out = [];
const record = (id, evidence) => { out.push({ id, evidence }); console.log(JSON.stringify({ id, evidence })); };
const a = '00000000-0000-0000-0000-000000000001';
const b = '00000000-0000-0000-0000-000000000002';
const outlet = '00000000-0000-0000-0000-000000000010';
const menu = '00000000-0000-0000-0000-000000000020';
async function as(role, uid = '', callback) {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]);
  await db.exec(`SET ROLE ${role}`);
  try { return await callback(); } finally { await db.exec('RESET ROLE'); }
}
async function scalar(sql, params = []) { return Object.values((await db.query(sql, params)).rows[0])[0]; }
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text UNIQUE, raw_user_meta_data jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner_id text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
    GRANT ALL ON storage.objects TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;`);
  const journal = JSON.parse(read('drizzle/migrations/meta/_journal.json'));
  for (const entry of journal.entries) {
    const path = `drizzle/migrations/${entry.tag}.sql`;
    try { await db.exec(read(path)); }
    catch (error) { throw new Error(`Migration ${entry.tag}: ${error.message}`, { cause: error }); }
  }
  console.log(`Loaded ${journal.entries.length} journaled migrations`);
  await db.query('INSERT INTO outlets(id,name,code) VALUES($1,$2,$3)', [outlet, 'Audit Kitchen', 'AUDIT']);
  for (const [id, name] of [[a,'Audit Alice'],[b,'Audit Bob']]) {
    await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)', [id, `${id.slice(-1)}@audit-example.com`, { full_name: name, outlet_id: outlet }]);
  }
  await db.query('INSERT INTO menu_items(id,outlet_id,name,category,price_kobo,is_credit_eligible) VALUES($1,$2,$3,$4,$5,true)', [menu,outlet,'Audit Rice','rice',260000]);

  const before = Number(await scalar('SELECT balance_kobo FROM wallets WHERE customer_id=$1',[a]));
  await as('anon','',() => db.query('SELECT apply_wallet_refund($1,100000,$2,NULL)', [a,'AUDIT-SAME-REFERENCE']));
  await as('anon','',() => db.query('SELECT apply_wallet_refund($1,100000,$2,NULL)', [a,'AUDIT-SAME-REFERENCE']));
  const after = Number(await scalar('SELECT balance_kobo FROM wallets WHERE customer_id=$1',[a]));
  assert.equal(after-before,200000);
  record('SEC-01', { anonymousWalletCreditKobo: after-before, replayWithSameReference: true });

  const tokensBefore = Number(await scalar('SELECT available_tokens FROM token_accounts WHERE customer_id=$1',[a]));
  await as('anon','',() => db.query('SELECT lock_referral_reward($1,$2)',[a,b]));
  await as('anon','',() => db.query('SELECT unlock_referral_reward($1)',[b]));
  const tokensAfter = Number(await scalar('SELECT available_tokens FROM token_accounts WHERE customer_id=$1',[a]));
  assert(tokensAfter>tokensBefore);
  assert.equal(Number(await scalar('SELECT count(*) FROM orders')),0);
  record('SEC-02',{ anonymousUnearnedTokens: tokensAfter-tokensBefore, orders: 0 });

  const sub = '00000000-0000-0000-0000-000000000030';
  await db.query("INSERT INTO subscriptions(id,customer_id,outlet_id,plan,tier,price_kobo) VALUES($1,$2,$3,'weekly','basic',1800000)",[sub,b,outlet]);
  await db.query("INSERT INTO loans(customer_id,outlet_id,principal_kobo,charge_kobo,total_due_kobo,term_days,due_at,item_summary) VALUES($1,$2,100000,15000,115000,7,now()+interval '7 days','Private audit loan')",[b,outlet]);
  const reads = await as('authenticated',a,async () => ({
    othersSubscriptions: Number(await scalar('SELECT count(*) FROM subscriptions WHERE customer_id=$1',[b])),
    othersLoans: Number(await scalar('SELECT count(*) FROM loans WHERE customer_id=$1',[b])),
    othersProfiles: Number(await scalar('SELECT count(*) FROM profiles WHERE id=$1',[b])),
    othersWallets: Number(await scalar('SELECT count(*) FROM wallets WHERE customer_id=$1',[b])),
  }));
  assert.equal(reads.othersSubscriptions,1); assert.equal(reads.othersLoans,1);
  assert.equal(reads.othersProfiles,0); assert.equal(reads.othersWallets,0);
  record('SEC-03',reads);

  await db.query("INSERT INTO outlet_plan_prices(outlet_id,plan,tier,price_kobo) VALUES($1,'weekly','basic',1800000),($1,'monthly','turbo',9000000)",[outlet]);
  await as('service_role','',() => db.query("SELECT prepare_subscription_payment($1,$2,'CDPS-AUDIT')",[b,sub]));
  await as('authenticated',b,() => db.query("UPDATE subscriptions SET plan='monthly',tier='turbo' WHERE id=$1",[sub]));
  await as('service_role','',() => db.query("SELECT settle_verified_payment('CDPS-AUDIT',1800000,'NGN',$1)",[{reference:'CDPS-AUDIT',status:'success'}]));
  const activated = (await db.query('SELECT plan,tier,status,price_kobo FROM subscriptions WHERE id=$1',[sub])).rows[0];
  const entitlements = (await db.query('SELECT count(*)::int AS days,sum(allowance)::int AS meals FROM meal_entitlements WHERE subscription_id=$1',[sub])).rows[0];
  assert.equal(activated.plan,'monthly'); assert.equal(activated.tier,'turbo'); assert.equal(activated.status,'active'); assert(entitlements.meals>=84);
  record('SEC-04',{ ...activated,...entitlements, paidKobo:1800000, monthlyTurboPriceKobo:9000000 });

  await db.query('UPDATE profiles SET is_active=false WHERE id=$1',[a]);
  const checkin = await as('authenticated',a,() => db.query('SELECT claim_daily_checkin() AS result'));
  assert(checkin.rows[0].result.total>0);
  await db.query('UPDATE wallets SET balance_kobo=1000000 WHERE customer_id=$1',[a]);
  await as('authenticated',a,() => db.query("SELECT place_order_with_fulfillment($1,'cash_wallet','pickup')",[[{menu_item_id:menu,quantity:1}]]));
  record('SEC-05',{ frozenCustomerReceivedReward:true,frozenCustomerPlacedPaidOrder:true });

  // The hosted legacy definition was read through metadata only; execute it
  // against synthetic local records to confirm its cap-free behavior.
  const liveFunctions = JSON.parse(read('security-audit/live-functions.json')).rows;
  await db.exec(liveFunctions.find(f=>f.signature.startsWith('place_order(')).definition);
  await db.query('UPDATE profiles SET is_active=true WHERE id=$1',[b]);
  await db.query('UPDATE wallets SET balance_kobo=0 WHERE customer_id=$1',[b]);
  const oldOrder = await as('authenticated',b,() => db.query("SELECT place_order($1,'subscription_entitlement',$2) AS result",[[{menu_item_id:menu,quantity:1}],sub]));
  assert.equal(oldOrder.rows[0].result.total_kobo,0);
  record('SEC-06',{ legacySubscriptionFoodKobo:260000,walletDebitKobo:0,entitlementRedeemed:true });

  fs.writeFileSync(new URL('security-audit/reproduction-results.json',root),JSON.stringify({localOnly:true,migrations:journal.entries.length,findings:out},null,2)+'\n');
} finally { await db.close(); }
