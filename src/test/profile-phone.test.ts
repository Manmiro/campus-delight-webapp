// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Profile phone normalization and uniqueness", () => {
  const db = new PGlite();

  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, phone text);
      INSERT INTO public.profiles VALUES
        ('00000000-0000-0000-0000-000000000001', '0803 000 0000'),
        ('00000000-0000-0000-0000-000000000002', NULL);
    `);
    await db.exec(readFileSync("drizzle/migrations/0027_normalize_unique_profile_phones.sql", "utf8"));
  }, 30000);

  afterAll(async () => {
    await db.close();
  });

  it("backfills Nigerian numbers to E.164 and normalizes new profile inserts", async () => {
    const { rows } = await db.query<{ phone: string }>("SELECT phone FROM public.profiles WHERE id = $1", ["00000000-0000-0000-0000-000000000001"]);
    expect(rows[0]?.phone).toBe("+2348030000000");

    await db.query("INSERT INTO public.profiles VALUES ($1, $2)", ["00000000-0000-0000-0000-000000000003", "2348030000001"]);
    const { rows: inserted } = await db.query<{ phone: string }>("SELECT phone FROM public.profiles WHERE id = $1", ["00000000-0000-0000-0000-000000000003"]);
    expect(inserted[0]?.phone).toBe("+2348030000001");
  });

  it("rejects a second profile using the same normalized phone number", async () => {
    await expect(
      db.query("INSERT INTO public.profiles VALUES ($1, $2)", ["00000000-0000-0000-0000-000000000004", "2348030000000"]),
    ).rejects.toThrow();
  });
});
