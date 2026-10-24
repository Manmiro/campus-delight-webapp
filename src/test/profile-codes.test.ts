import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

describe('Customer and referral code allocation', () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text, email text, phone text, outlet_id uuid,
        customer_code text NOT NULL UNIQUE, referral_code text NOT NULL UNIQUE, gender text, date_of_birth date);
      INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-000000000001', 'Existing', null, null, null, 'CDABCDEF12', 'CDRABC123', null, null);
      CREATE TABLE public.outlets (id uuid, status text);
      CREATE TABLE public.user_roles (user_id uuid, role text);
      CREATE TABLE public.wallets (customer_id uuid);
      CREATE TABLE public.token_accounts (customer_id uuid, available_tokens integer);
      CREATE TABLE public.token_ledger (customer_id uuid, tx_type text, amount integer, to_available integer, available_after integer, locked_after integer, reference text, description text);
      CREATE FUNCTION public.lock_referral_reward(uuid, uuid) RETURNS void LANGUAGE sql AS 'SELECT';
      CREATE TABLE public.signup_fixture (id uuid, email text, raw_user_meta_data jsonb);
    `);
    await db.exec(readFileSync('drizzle/migrations/0011_eight_character_profile_codes.sql', 'utf8'));
    await db.exec(`CREATE TRIGGER signup AFTER INSERT ON public.signup_fixture FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
      UPDATE public.profiles SET customer_code = '', referral_code = '' WHERE customer_code !~ '^CD[0-9]{6}$' OR referral_code !~ '^CD[0-9]{6}$';
      INSERT INTO public.signup_fixture SELECT gen_random_uuid(), 'fixture@example.test', '{"full_name":"New account"}'::jsonb FROM generate_series(1, 100);`);
  }, 30000);
  afterAll(async () => { await db.close(); });

  it('gives every new account CD plus exactly six decimal digits for both codes', async () => {
    const { rows } = await db.query<{ customer_code: string; referral_code: string }>(`SELECT customer_code, referral_code FROM public.profiles WHERE full_name = 'New account'`);
    expect(rows).toHaveLength(100);
    for (const row of rows) {
      expect(row.customer_code).toMatch(/^CD[0-9]{6}$/);
      expect(row.referral_code).toMatch(/^CD[0-9]{6}$/);
      expect(row.customer_code).toHaveLength(8);
      expect(row.referral_code).toHaveLength(8);
    }
    expect(new Set(rows.map(row => row.customer_code)).size).toBe(100);
    expect(new Set(rows.map(row => row.referral_code)).size).toBe(100);
  });
  it('changes existing codes without changing the account identity', async () => {
    const { rows } = await db.query<{ customer_code: string; referral_code: string }>(`SELECT customer_code, referral_code FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.customer_code).toMatch(/^CD[0-9]{6}$/);
    expect(rows[0]?.referral_code).toMatch(/^CD[0-9]{6}$/);
  });
});