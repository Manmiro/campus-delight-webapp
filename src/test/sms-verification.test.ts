// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("SMS code database safeguards", () => {
  const db = new PGlite();
  const id = "00000000-0000-0000-0000-000000000001";
  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA extensions;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''${id}''::uuid';
      CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql AS 'SELECT decode(''00003039'', ''hex'')';
      CREATE TABLE profiles(id uuid PRIMARY KEY, phone text, is_active boolean DEFAULT true, verification_status text DEFAULT 'unverified', full_name text, gender text, date_of_birth date, avatar_url text, leaderboard_opt_in boolean);
      INSERT INTO profiles(id,phone) VALUES('${id}','08030000000');
      CREATE TABLE otp_codes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid, code_hash text, consumed boolean DEFAULT false, purpose text, created_at timestamptz DEFAULT now(), expires_at timestamptz, failed_attempts integer DEFAULT 0);
      CREATE FUNCTION request_otp(text) RETURNS text LANGUAGE sql AS 'SELECT ''demo''';
      GRANT UPDATE ON profiles TO authenticated;`);
    await db.exec(readFileSync("drizzle/migrations/0021_secure_sms_verification.sql", "utf8"));
  }, 30000);
  afterAll(async () => { await db.close(); });
  async function fresh() {
    await db.exec("DELETE FROM otp_codes;");
    await db.query("SELECT issue_sms_otp($1)", [id]);
  }
  async function verify(code: string) {
    const { rows } = await db.query<{ valid: boolean }>("SELECT verify_otp($1) AS valid", [code]);
    return rows[0]?.valid;
  }
  it("limits issuing to service role, hides hashes, and blocks self-verification edits", async () => {
    const { rows } = await db.query<{ issue: boolean; old: boolean; hashes: boolean; verified: boolean; phone: boolean }>(`SELECT
      has_function_privilege('authenticated','issue_sms_otp(uuid)','EXECUTE') AS issue,
      has_function_privilege('authenticated','request_otp(text)','EXECUTE') AS old,
      has_table_privilege('authenticated','otp_codes','SELECT') AS hashes,
      has_column_privilege('authenticated','profiles','verification_status','UPDATE') AS verified,
      has_column_privilege('authenticated','profiles','phone','UPDATE') AS phone`);
    expect(rows[0]).toEqual({ issue: false, old: false, hashes: false, verified: false, phone: true });
  });
  it("issues five-digit codes expiring after exactly five minutes", async () => {
    await fresh();
    const { rows } = await db.query<{ seconds: number }>("SELECT extract(epoch from expires_at-created_at)::integer AS seconds FROM otp_codes");
    expect(rows[0]?.seconds).toBe(300);
    expect(await verify("12345")).toBe(true);
    expect(await verify("12345")).toBe(false);
  });
  it("preserves five failed attempts and then rejects the correct code", async () => {
    await fresh();
    for (let i = 0; i < 5; i++) expect(await verify("99999")).toBe(false);
    const { rows } = await db.query<{ failed_attempts: number }>("SELECT failed_attempts FROM otp_codes");
    expect(rows[0]?.failed_attempts).toBe(5);
    expect(await verify("12345")).toBe(false);
  });
  it("rejects expired codes", async () => {
    await fresh(); await db.exec("UPDATE otp_codes SET expires_at=now()-interval '1 second'");
    expect(await verify("12345")).toBe(false);
  });
  it("blocks concurrent-window resend within sixty seconds", async () => {
    await fresh();
    await expect(db.query("SELECT issue_sms_otp($1)", [id])).rejects.toThrow("wait 60 seconds");
  });
  it("a phone change resets verification and invalidates the previous phone's code", async () => {
    await fresh();
    await db.exec("UPDATE profiles SET verification_status='verified'; UPDATE profiles SET phone='08030000001';");
    expect(await verify("12345")).toBe(false);
    const { rows } = await db.query<{ verification_status: string }>("SELECT verification_status FROM profiles");
    expect(rows[0]?.verification_status).toBe("unverified");
  });
});