// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Headquarters manager lifecycle controls", () => {
  const db = new PGlite();
  const outlet = "00000000-0000-0000-0000-000000000010";
  const oldManager = "00000000-0000-0000-0000-000000000011";
  const newManager = "00000000-0000-0000-0000-000000000012";
  const hq = "00000000-0000-0000-0000-000000000099";

  beforeAll(async () => {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${hq}'::uuid $$;
      CREATE FUNCTION public.is_central_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text);
      CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, role text, UNIQUE(user_id, role));
      CREATE TABLE public.outlet_staff (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        outlet_id uuid NOT NULL,
        staff_role text NOT NULL,
        UNIQUE(user_id, outlet_id, staff_role)
      );
      CREATE TABLE public.audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id uuid,
        action text,
        entity text,
        entity_id text,
        details jsonb
      );
      INSERT INTO public.profiles VALUES ('${oldManager}', 'Old Manager'), ('${newManager}', 'New Manager');
      INSERT INTO public.user_roles(user_id, role) VALUES ('${oldManager}', 'outlet_manager');
      INSERT INTO public.outlet_staff(user_id, outlet_id, staff_role) VALUES ('${oldManager}', '${outlet}', 'outlet_manager');
    `);
    await db.exec(readFileSync("drizzle/migrations/0029_manager_lifecycle_controls.sql", "utf8"));
  }, 30000);

  afterAll(async () => {
    await db.close();
  });

  it("suspends and restores the assignment and manager role", async () => {
    await db.query("SELECT public.admin_set_outlet_manager_suspension($1, true, $2)", [outlet, "Temporary leave"]);
    const { rows: suspended } = await db.query<{ status: string }>("SELECT status FROM public.outlet_staff WHERE user_id = $1", [oldManager]);
    expect(suspended[0]?.status).toBe("suspended");
    const { rows: suspendedRole } = await db.query("SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'outlet_manager'", [oldManager]);
    expect(suspendedRole).toHaveLength(0);

    await db.query("SELECT public.admin_set_outlet_manager_suspension($1, false, $2)", [outlet, "Back from leave"]);
    const { rows: restored } = await db.query<{ status: string }>("SELECT status FROM public.outlet_staff WHERE user_id = $1", [oldManager]);
    expect(restored[0]?.status).toBe("active");
    const { rows: restoredRole } = await db.query("SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'outlet_manager'", [oldManager]);
    expect(restoredRole).toHaveLength(1);
  });

  it("replaces the old manager atomically and removes the old role", async () => {
    await db.query("SELECT public.admin_replace_outlet_manager($1, $2, $3)", [outlet, newManager, "New appointment"]);
    const { rows: assignments } = await db.query<{ user_id: string; status: string }>("SELECT user_id, status FROM public.outlet_staff WHERE outlet_id = $1", [outlet]);
    expect(assignments).toEqual([{ user_id: newManager, status: "active" }]);
    const { rows: oldRole } = await db.query("SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'outlet_manager'", [oldManager]);
    const { rows: newRole } = await db.query("SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'outlet_manager'", [newManager]);
    expect(oldRole).toHaveLength(0);
    expect(newRole).toHaveLength(1);
  });

  it("removes the assignment and manager role", async () => {
    await db.query("SELECT public.admin_remove_outlet_manager($1, $2)", [outlet, "Manager resigned"]);
    const { rows: assignments } = await db.query("SELECT 1 FROM public.outlet_staff WHERE outlet_id = $1", [outlet]);
    const { rows: roles } = await db.query("SELECT 1 FROM public.user_roles WHERE user_id = $1 AND role = 'outlet_manager'", [newManager]);
    expect(assignments).toHaveLength(0);
    expect(roles).toHaveLength(0);
  });
});
