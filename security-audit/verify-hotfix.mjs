import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
try {
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
 const definitions=JSON.parse(fs.readFileSync('security-audit/live-functions.json','utf8')).rows;
 for(const name of ['apply_wallet_refund(','lock_referral_reward(','unlock_referral_reward(']) await db.exec(definitions.find(f=>f.signature.startsWith(name)).definition);
 await db.exec(fs.readFileSync('drizzle/proposed/security_privilege_hotfix.sql','utf8'));
 for(const signature of ['apply_wallet_refund(uuid,bigint,text,uuid)','lock_referral_reward(uuid,uuid)','unlock_referral_reward(uuid)']) {
  for(const role of ['anon','authenticated']) {
   const {rows}=await db.query('SELECT has_function_privilege($1,$2,$3) allowed',[role,signature,'EXECUTE']);
   assert.equal(rows[0].allowed,false);
  }
  assert.equal((await db.query("SELECT has_function_privilege('service_role',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,true);
 }
 await db.exec('CREATE TABLE wallets(customer_id uuid PRIMARY KEY,balance_kobo bigint,updated_at timestamptz); CREATE TABLE wallet_ledger(customer_id uuid,tx_type text,amount_kobo bigint,balance_after_kobo bigint,reference text,related_order_id uuid,description text);');
 await db.exec("INSERT INTO wallets VALUES('00000000-0000-0000-0000-000000000001',0,now());");
 // Trusted SECURITY DEFINER callers retain owner execution rights.
 await db.exec("CREATE FUNCTION trusted_refund() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT apply_wallet_refund('00000000-0000-0000-0000-000000000001',10000,'REFUND-AUDIT',NULL) $$; GRANT EXECUTE ON FUNCTION trusted_refund() TO authenticated; SET ROLE authenticated; SELECT trusted_refund(); RESET ROLE;");
 assert.equal((await db.query('SELECT balance_kobo FROM wallets')).rows[0].balance_kobo,10000);
 console.log('PASS: anonymous/customer calls denied; service and trusted financial callers preserved');
} finally { await db.close(); }
