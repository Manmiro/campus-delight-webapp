import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

async function assertCentralAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "central_admin",
  });
  if (!isAdmin) throw new Error("Forbidden: central administrators only");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const adminCreateOutlet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { name: string; code: string; location?: string; address?: string; contactPhone?: string; contactEmail?: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const { data: outlet, error } = await db
      .from("outlets")
      .insert({
        name: data.name,
        code: data.code.toUpperCase(),
        location: data.location ?? null,
        address: data.address ?? null,
        contact_phone: data.contactPhone ?? null,
        contact_email: data.contactEmail ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await db.from("audit_logs").insert({
      actor_id: context.userId,
      action: "create_outlet",
      entity: "outlets",
      entity_id: outlet.id,
      details: { code: outlet.code },
    });
    return outlet;
  });

export const adminUpdateOutlet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string; status?: string; name?: string; location?: string; address?: string }) => input)
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const patch: { status?: string; name?: string; location?: string; address?: string } = {};
    if (data["status"]) patch["status"] = data["status"];
    if (data["name"]) patch["name"] = data["name"];
    if (data["location"] !== undefined) patch["location"] = data["location"];
    if (data["address"] !== undefined) patch["address"] = data["address"];
    const { data: outlet, error } = await db
      .from("outlets")
      .update(patch)
      .eq("id", data.outletId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await db.from("audit_logs").insert({
      actor_id: context.userId,
      action: "update_outlet",
      entity: "outlets",
      entity_id: data.outletId,
      details: patch,
    });
    return outlet;
  });

/** Creates (or reuses) an outlet manager account with the outlet_staff assignment. */
export const adminSetOutletManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string; email: string; fullName: string; password: string }) => input)
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const { data: users, error: listErr } = await db.auth.admin.listUsers();
    if (listErr) throw new Error(listErr.message);
    let userId = users.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase())?.id;

    if (!userId) {
      const { data: created, error: createErr } = await db.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.fullName },
      });
      if (createErr) throw new Error(createErr.message);
      if (!created.user) throw new Error("Could not create the manager account");
      userId = created.user.id;
    }

    const { error: roleErr } = await db.from("user_roles").upsert({ user_id: userId, role: "outlet_manager" });
    if (roleErr) throw new Error(roleErr.message);
    const { error: staffErr } = await db
      .from("outlet_staff")
      .upsert(
        { user_id: userId, outlet_id: data.outletId, staff_role: "outlet_manager" },
        { onConflict: "user_id,outlet_id,staff_role" },
      );
    if (staffErr) throw new Error(staffErr.message);
    // Signup already creates the profile and allocates codes; preserve them on reassignment.
    const { error: profileErr } = await db.from("profiles").update({
      full_name: data.fullName,
      email: data.email,
      is_active: false,
    }).eq("id", userId);
    if (profileErr) throw new Error(profileErr.message);
    await db.from("audit_logs").insert({
      actor_id: context.userId,
      action: "assign_outlet_manager",
      entity: "outlet_staff",
      entity_id: data.outletId,
      details: { email: data.email },
    });
    return { userId };
  });

/** Approves or rejects an outlet-transfer application (central HQ only). */
export const adminDecideTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { applicationId: string; approve: boolean; note?: string }) => input)
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const status = data.approve ? "approved" : "rejected";
    const { data: app, error } = await db
      .from("outlet_transfer_applications")
      .update({ status, reviewed_by: context.userId, decided_at: new Date().toISOString() })
      .eq("id", data.applicationId)
      .in("status", ["submitted", "under_review"])
      .select()
      .single();
    if (error || !app) throw new Error(error?.message ?? "Application not found or already decided");

    if (data.approve) {
      await db.from("profiles").update({ outlet_id: app.to_outlet_id }).eq("id", app.customer_id);
      await db
        .from("outlet_transfer_applications")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", app.id);
      await db
        .from("notifications")
        .insert({
          customer_id: app.customer_id,
          title: "Outlet transfer completed",
          body: "Your transfer was approved. Future orders and subscriptions now use your new outlet.",
        });
    } else {
      await db.from("notifications").insert({
        customer_id: app.customer_id,
        title: "Transfer application rejected",
        body: data.note ?? "Your outlet-transfer application was not approved.",
      });
    }
    await db.from("audit_logs").insert({
      actor_id: context.userId,
      action: "decide_outlet_transfer",
      entity: "outlet_transfer_applications",
      entity_id: app.id,
      details: { approved: data.approve },
    });
    return { ok: true };
  });

export const adminUpdateConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string; value: unknown }) => ({ ...input, value: JSON.parse(JSON.stringify(input.value)) as Json }))
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const { error } = await db
      .from("system_config")
      .update({ value: data.value, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    await db.from("audit_logs").insert({
      actor_id: context.userId,
      action: "update_config",
      entity: "system_config",
      entity_id: data.key,
      details: { value: data.value as any },
    });
    return { ok: true };
  });
