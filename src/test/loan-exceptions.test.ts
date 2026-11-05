// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';

const db = new PGlite();
const customer = '00000000-0000-0000-0000-000000000001';
const loan = '00000000-0000-0000-0000-000000000002';
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${customer}'::uuid $$;
    CREATE FUNCTION public.is_central_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE loans(id uuid PRIMARY KEY,customer_id uuid,status text,due_at timestamptz,total_due_kobo bigint,overdue_kobo bigint,outlet_id uuid,item_summary text);
    CREATE TABLE profiles(id uuid PRIMARY KEY,email text,full_name text,is_active boolean);
    CREATE TABLE outlets(id uuid PRIMARY KEY,name text);
    CREATE TABLE audit_logs(actor_id uuid,action text,entity text,entity_id text,details jsonb);
    CREATE FUNCTION loan_outstanding_kobo(uuid) RETURNS bigint LANGUAGE sql AS $$ SELECT 92000::bigint $$;
    INSERT INTO loans VALUES('${loan}','${customer}','overdue',now()-interval '4 days',92000,36800,null,'Rice');`);
  await db.exec(readFileSync('drizzle/migrations/0040_hq_overdue_restriction_exceptions.sql','utf8'));
},30000);
afterAll(async()=>{await db.close()});
it('HQ restores ordering separately from transfers and does not erase debt',async()=>{
  await db.query('SELECT admin_set_loan_restriction_exception($1,true,false,$2)',[loan,'Approved ordering exception']);
  const {rows} = await db.query<{r:{orderingLocked:boolean;transfersFrozen:boolean}}>('SELECT customer_loan_restrictions() r');
  expect(rows[0]?.r).toMatchObject({orderingLocked:false,transfersFrozen:true});
  const debt = await db.query('SELECT total_due_kobo,overdue_kobo FROM loans');
  expect(debt.rows[0]).toEqual({total_due_kobo:92000,overdue_kobo:36800});
});
it('HQ can unfreeze transfers and revoke exceptions',async()=>{
  await db.query('SELECT admin_set_loan_restriction_exception($1,true,true,$2)',[loan,'Approved transfer exception']);
  expect((await db.query<{r:{transfersFrozen:boolean}}>('SELECT customer_loan_restrictions() r')).rows[0]?.r.transfersFrozen).toBe(false);
  await db.query('SELECT admin_set_loan_restriction_exception($1,false,false,$2)',[loan,'Revoke exceptions']);
  expect((await db.query<{r:unknown}>('SELECT customer_loan_restrictions() r')).rows[0]?.r).toMatchObject({orderingLocked:true,transfersFrozen:true});
  expect((await db.query('SELECT * FROM audit_logs')).rows).toHaveLength(3);
});
it('non-headquarters users cannot restore access',async()=>{
  await db.exec('CREATE OR REPLACE FUNCTION is_central_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$');
  await expect(db.query('SELECT admin_set_loan_restriction_exception($1,true,true,$2)',[loan,'Unauthorised'])).rejects.toThrow('Forbidden');
});