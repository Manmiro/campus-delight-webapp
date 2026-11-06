import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { isDisposableEmailAddress, normalizeEmailAddress } from "@/lib/auth-rules";

async function assertCentralAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "central_admin",
  });
  if (!isAdmin) throw new Error("Forbidden: central administrators only");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const adminListOutlets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertCentralAdmin(context);
    const { data, error } = await db
      .from("outlets")
      .select("id, name, code, location, address, contact_phone, contact_email, status, price_edit_locked, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const menuCategorySchema = z.enum(["meals", "rice", "pastries", "swallow", "drinks", "snacks", "sides"]);
const planSchema = z.enum(["weekend", "weekly", "monthly"]);
const tierSchema = z.enum(["basic", "standard", "turbo"]);

export const adminListOutletCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string }) => z.object({ outletId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const [{ data: outlet, error: outletError }, { data: menu, error: menuError }, { data: prices, error: priceError }] = await Promise.all([
      db.from("outlets").select("id, name, code, price_edit_locked").eq("id", data.outletId).single(),
      db.from("menu_items").select("id, outlet_id, name, category, price_kobo, is_available, is_credit_eligible").eq("outlet_id", data.outletId).order("category").order("name"),
      db.from("outlet_plan_prices").select("id, outlet_id, plan, tier, price_kobo, is_active").eq("outlet_id", data.outletId).order("plan").order("tier"),
    ]);
    if (outletError) throw new Error(outletError.message);
    if (menuError) throw new Error(menuError.message);
    if (priceError) throw new Error(priceError.message);
    return { outlet, menu: menu ?? [], prices: prices ?? [] };
  });

export const adminListOutletOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string }) => z.object({ outletId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const { data: orders, error } = await db
      .from("orders")
      .select("*, order_items(*), customer:profiles(full_name, customer_code)")
      .eq("outlet_id", data.outletId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return orders ?? [];
  });

export const adminUpsertMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string; menuItemId?: string; name: string; category: string; priceKobo: number; isCreditEligible: boolean; isAvailable?: boolean }) =>
    z.object({
      outletId: z.string().uuid(),
      menuItemId: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(120),
      category: menuCategorySchema,
      priceKobo: z.number().int().positive().safe(),
      isCreditEligible: z.boolean(),
      isAvailable: z.boolean().optional(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const patch = {
      outlet_id: data.outletId,
      name: data.name,
      category: data.category,
      price_kobo: data.priceKobo,
      is_credit_eligible: data.isCreditEligible,
      ...(data.isAvailable === undefined ? {} : { is_available: data.isAvailable }),
    };
    const query = data.menuItemId
      ? db.from("menu_items").update(patch).eq("id", data.menuItemId).eq("outlet_id", data.outletId).select().single()
      : db.from("menu_items").insert(patch).select().single();
    const { data: item, error } = await query;
    if (error) throw new Error(error.message);
    await db.from("audit_logs").insert({
      actor_id: context.userId,
      action: data.menuItemId ? "admin_update_menu_item" : "admin_create_menu_item",
      entity: "menu_items",
      entity_id: item.id,
      details: { outlet_id: data.outletId, price_kobo: data.priceKobo },
    });
    return item;
  });

export const adminDeleteMenuItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string; menuItemId: string }) => z.object({ outletId: z.string().uuid(), menuItemId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const { error } = await db.from("menu_items").delete().eq("id", data.menuItemId).eq("outlet_id", data.outletId);
    if (error) throw new Error(error.message);
    await db.from("audit_logs").insert({ actor_id: context.userId, action: "admin_delete_menu_item", entity: "menu_items", entity_id: data.menuItemId, details: { outlet_id: data.outletId } });
    return { ok: true };
  });

export const adminUpsertPlanPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string; plan: string; tier: string; priceKobo: number; isActive?: boolean }) =>
    z.object({ outletId: z.string().uuid(), plan: planSchema, tier: tierSchema, priceKobo: z.number().int().nonnegative().safe(), isActive: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const { data: price, error } = await db.from("outlet_plan_prices").upsert({
      outlet_id: data.outletId,
      plan: data.plan,
      tier: data.tier,
      price_kobo: data.priceKobo,
      is_active: data.isActive ?? true,
    }, { onConflict: "outlet_id,plan,tier" }).select().single();
    if (error) throw new Error(error.message);
    await db.from("audit_logs").insert({ actor_id: context.userId, action: "admin_update_plan_price", entity: "outlet_plan_prices", entity_id: price.id, details: { outlet_id: data.outletId, plan: data.plan, tier: data.tier, price_kobo: data.priceKobo } });
    return price;
  });

export const adminSetOutletPriceEditLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string; locked: boolean; reason: string }) => z.object({ outletId: z.string().uuid(), locked: z.boolean(), reason: z.string().trim().min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCentralAdmin(context);
    const { data: result, error } = await context.supabase.rpc("admin_set_outlet_price_edit_lock", { p_outlet_id: data.outletId, p_locked: data.locked, p_reason: data.reason });
    if (error) throw new Error(error.message);
    return result;
  });

type ManagerAccountInput = { email: string; fullName: string; password: string };

export const adminRestoreLoanAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { loanId: string; orderingRestored: boolean; transfersRestored: boolean; reason: string }) =>
    z.object({ loanId: z.string().uuid(), orderingRestored: z.boolean(), transfersRestored: z.boolean(), reason: z.string().trim().min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("admin_set_loan_restriction_exception", {
      p_loan_id: data.loanId, p_ordering_restored: data.orderingRestored, p_transfers_restored: data.transfersRestored, p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return result;
  });

async function ensureManagerAccount(db: any, data: ManagerAccountInput): Promise<string> {
  const email = normalizeEmailAddress(data.email);
  if (isDisposableEmailAddress(email)) throw new Error("Temporary email addresses are not accepted. Use a permanent email address.");
  const { data: users, error: listErr } = await db.auth.admin.listUsers();
  if (listErr) throw new Error(listErr.message);
  let userId = users.users.find((u: { email?: string | null }) => normalizeEmailAddress(u.email ?? "") === email)?.id;

  if (!userId) {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createErr) throw new Error(createErr.message);
    if (!created.user) throw new Error("Could not create the manager account");
    userId = created.user.id;
  }

  const { error: profileErr } = await db.from("profiles").update({ full_name: data.fullName, email, is_active: true }).eq("id", userId);
  if (profileErr) throw new Error(profileErr.message);
  return userId;
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
  .inputValidator((input: {
    outletId: string;
    status?: string;
    name?: string;
    code?: string;
    location?: string;
    address?: string;
    contactPhone?: string;
    contactEmail?: string;
  }) => z.object({
    outletId: z.string().uuid(),
    status: z.enum(["active", "suspended", "inactive"]).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    code: z.string().trim().min(1).max(50).optional(),
    location: z.string().trim().max(200).optional(),
    address: z.string().trim().max(500).optional(),
    contactPhone: z.string().trim().max(50).optional(),
    contactEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const patch: {
      status?: string;
      name?: string;
      code?: string;
      location?: string | null;
      address?: string | null;
      contact_phone?: string | null;
      contact_email?: string | null;
    } = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.name !== undefined) patch.name = data.name;
    if (data.code !== undefined) patch.code = data.code.toUpperCase();
    if (data.location !== undefined) patch.location = data.location || null;
    if (data.address !== undefined) patch.address = data.address || null;
    if (data.contactPhone !== undefined) patch.contact_phone = data.contactPhone || null;
    if (data.contactEmail !== undefined) patch.contact_email = data.contactEmail || null;
    if (Object.keys(patch).length === 0) throw new Error("No outlet changes provided");
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

export const adminDeleteOutlet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string }) => z.object({ outletId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Check authority in the server handler, then let the audited RPC perform
    // the deletion using the signed-in admin's database identity.
    await assertCentralAdmin(context);
    const { data: result, error } = await context.supabase.rpc("admin_delete_outlet", {
      p_outlet_id: data.outletId,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const adminCreateCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fullName: string; email: string; phone?: string; password: string; outletId: string }) =>
    z.object({
      fullName: z.string().trim().min(1).max(100),
      email: z.string().trim().email().max(254).transform(normalizeEmailAddress).refine((email) => !isDisposableEmailAddress(email), "Temporary email addresses are not accepted. Use a permanent email address."),
      phone: z.string().trim().max(50).optional().or(z.literal("")),
      password: z.string().min(6).max(128),
      outletId: z.string().uuid(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const { data: outlet, error: outletError } = await db
      .from("outlets")
      .select("id")
      .eq("id", data.outletId)
      .eq("status", "active")
      .maybeSingle();
    if (outletError) throw new Error(outletError.message);
    if (!outlet) throw new Error("Choose an active outlet");

    const { data: created, error: createError } = await db.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        phone: data.phone || null,
        outlet_id: data.outletId,
      },
    });
    if (createError) throw new Error(createError.message);
    if (!created.user) throw new Error("Could not create the customer account");

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id, full_name, email, customer_code")
      .eq("id", created.user.id)
      .single();
    if (profileError || !profile) throw new Error(profileError?.message ?? "Customer profile was not created");

    const { error: auditError } = await db.from("audit_logs").insert({
      actor_id: context.userId,
      action: "create_customer",
      entity: "profiles",
      entity_id: profile.id,
      details: { customer_code: profile.customer_code, outlet_id: data.outletId },
    });
    if (auditError) throw new Error(auditError.message);
    return profile;
  });

export const adminDeleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customerId: string; reason: string }) =>
    z.object({ customerId: z.string().uuid(), reason: z.string().trim().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const { data: result, error } = await context.supabase.rpc("admin_delete_customer", {
      p_customer: data.customerId,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);

    const { error: authError } = await db.auth.admin.deleteUser(data.customerId);
    if (authError) throw new Error(`Customer data was removed, but authentication cleanup failed: ${authError.message}`);
    return result;
  });

/** Creates (or reuses) an outlet manager account with the outlet_staff assignment. */
export const adminSetOutletManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string; email: string; fullName: string; password: string }) => input)
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const userId = await ensureManagerAccount(db, data);
    const { data: result, error } = await context.supabase.rpc("admin_replace_outlet_manager", {
      p_outlet_id: data.outletId,
      p_new_user_id: userId,
      p_reason: "Headquarters manager assignment",
    });
    if (error) throw new Error(error.message);
    return { userId, result };
  });

export const adminReplaceOutletManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string; email: string; fullName: string; password: string; reason: string }) =>
    z.object({ outletId: z.string().uuid(), email: z.string().trim().email(), fullName: z.string().trim().min(1).max(100), password: z.string().min(6), reason: z.string().trim().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await assertCentralAdmin(context);
    const userId = await ensureManagerAccount(db, data);
    // Run as the signed-in admin so the database can confirm headquarters authority.
    const { data: result, error } = await context.supabase.rpc("admin_replace_outlet_manager", {
      p_outlet_id: data.outletId,
      p_new_user_id: userId,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { userId, result };
  });

export const adminManagerLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { outletId: string; action: "remove" | "suspend" | "restore"; reason: string }) =>
    z.object({ outletId: z.string().uuid(), action: z.enum(["remove", "suspend", "restore"]), reason: z.string().trim().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error, data: result } = data.action === "remove"
      ? await context.supabase.rpc("admin_remove_outlet_manager", { p_outlet_id: data.outletId, p_reason: data.reason })
      : await context.supabase.rpc("admin_set_outlet_manager_suspension", { p_outlet_id: data.outletId, p_suspended: data.action === "suspend", p_reason: data.reason });
    if (error) throw new Error(error.message);
    return result;
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
    const { emailOutletDecision, tryTransactionEmail } = await import('./transaction-emails.server');
    await tryTransactionEmail(() => emailOutletDecision(app.id));
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

export const adminAdjustBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customerId: string; cashDeltaKobo: number; tokenDelta: number; reason: string; reference: string }) =>
    z.object({
      customerId: z.string().uuid(),
      cashDeltaKobo: z.number().int().safe().max(10_000_000_000),
      tokenDelta: z.number().int().safe().max(1_000_000_000),
      reason: z.string().trim().min(1).max(500),
      reference: z.string().trim().min(1).max(100),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("admin_adjust_balances", {
      p_customer: data.customerId,
      p_cash_delta_kobo: data.cashDeltaKobo,
      p_token_delta: data.tokenDelta,
      p_reason: data.reason,
      p_reference: data.reference,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const adminSetAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customerId: string; isActive: boolean; reason: string }) =>
    z.object({
      customerId: z.string().uuid(),
      isActive: z.boolean(),
      reason: z.string().trim().min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("admin_set_account_status", {
      p_customer: data.customerId,
      p_is_active: data.isActive,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return result;
  });
