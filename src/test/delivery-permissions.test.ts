// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

describe('outlet delivery fee permissions', () => {
  const db = new PGlite();
  const own = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  beforeAll(async () => {
    await db.exec(`CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000003'::uuid $$;
      CREATE TABLE public.outlets(id uuid PRIMARY KEY,delivery_fee_kobo bigint DEFAULT 60000);
      INSERT INTO public.outlets(id) VALUES ('${own}'),('${other}');
      CREATE TABLE public.audit_logs(actor_id uuid,action text,entity text,entity_id text,details jsonb);
      CREATE FUNCTION public.is_central_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE FUNCTION public.is_outlet_manager(id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT id='${own}'::uuid $$;`);
    const sql = readFileSync('drizzle/migrations/0022_delivery_pickup_checkout.sql', 'utf8');
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.set_outlet_delivery_fee');
    const end = sql.indexOf('REVOKE ALL ON FUNCTION public.set_outlet_delivery_fee');
    if (start < 0 || end < 0) throw new Error('Delivery fee migration function missing');
    await db.exec(sql.slice(start, end));
  }, 30000);
  afterAll(async () => db.close());
  it('manager adjusts their own outlet and records the fee', async () => {
    await db.query('SELECT public.set_outlet_delivery_fee($1,75000)', [own]);
    const { rows } = await db.query<{ delivery_fee_kobo: number }>('SELECT delivery_fee_kobo FROM public.outlets WHERE id=$1', [own]);
    expect(Number(rows[0]?.delivery_fee_kobo)).toBe(75000);
    const audit = await db.query('SELECT * FROM public.audit_logs');
    expect(audit.rows).toHaveLength(1);
  });
  it('manager cannot change another outlet fee', async () => {
    await expect(db.query('SELECT public.set_outlet_delivery_fee($1,10000)', [other])).rejects.toThrow('Only this outlet manager');
    const { rows } = await db.query<{ delivery_fee_kobo: number }>('SELECT delivery_fee_kobo FROM public.outlets WHERE id=$1', [other]);
    expect(Number(rows[0]?.delivery_fee_kobo)).toBe(60000);
  });
  it('database rejects negative delivery fees', async () => {
    await expect(db.query('SELECT public.set_outlet_delivery_fee($1,-1)', [own])).rejects.toThrow('valid non-negative');
  });
});