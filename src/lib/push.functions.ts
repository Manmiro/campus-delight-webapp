import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const subscriptionInput = z.object({
  outletId: z.string().uuid(),
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(40).max(200),
  auth: z.string().min(16).max(100),
});

type PushAuthContext = { supabase: SupabaseClient<Database> };

export const getVapidPublicKey = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getVapidPublicKey: loadVapidPublicKey } = await import("@/lib/web-push.server");
    return { publicKey: await loadVapidPublicKey() };
  });

async function isCentralAdmin(context: PushAuthContext) {
  const { data, error } = await context.supabase.rpc("is_central_admin");
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function canManageOutlet(context: PushAuthContext, outletId: string) {
  if (await isCentralAdmin(context)) return true;
  const { data, error } = await context.supabase.rpc("is_outlet_manager", { _outlet_id: outletId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export const registerManagerPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => subscriptionInput.parse(input))
  .handler(async ({ context, data }) => {
    if (!(await canManageOutlet(context, data.outletId)))
      throw new Error("Only the active outlet manager or headquarters can enable this device");
    const { data: outlet, error: outletError } = await context.supabase
      .from("outlets")
      .select("manager_push_policy")
      .eq("id", data.outletId)
      .maybeSingle();
    if (outletError) throw new Error(outletError.message);
    if (!outlet || outlet.manager_push_policy !== "on")
      throw new Error("Headquarters has disabled notifications for this outlet");

    const db = (await isCentralAdmin(context))
      ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
      : context.supabase;
    const { error } = await db.from("manager_push_subscriptions").upsert(
      {
        user_id: context.userId,
        outlet_id: data.outletId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    );
    if (error) throw new Error(error.message);
    return { enabled: true };
  });

export const removeManagerPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ outletId: z.string().uuid(), endpoint: z.string().url().max(2048) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    if (!(await canManageOutlet(context, data.outletId)))
      throw new Error("Only the active outlet manager or headquarters can change this device");
    const db = (await isCentralAdmin(context))
      ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
      : context.supabase;
    const { error } = await db
      .from("manager_push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .eq("outlet_id", data.outletId)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { enabled: false };
  });

export const sendManagerPushTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ outletId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const central = await isCentralAdmin(context);
    if (!central && !(await canManageOutlet(context, data.outletId)))
      throw new Error("Only the active outlet manager or headquarters can test notifications");
    const { dispatchManagerPushTest } = await import("@/lib/push-dispatcher.server");
    return dispatchManagerPushTest(data.outletId, central ? undefined : context.userId);
  });

export const setOutletPushPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ outletId: z.string().uuid(), policy: z.enum(["on", "off", "locked"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    if (!(await isCentralAdmin(context)))
      throw new Error("Only headquarters can change outlet notification policy");
    const { data: result, error } = await context.supabase.rpc("admin_set_outlet_push_policy", {
      p_outlet_id: data.outletId,
      p_policy: data.policy,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const sendWhatsAppTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ outletId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const central = await isCentralAdmin(context);
    if (!central && !(await canManageOutlet(context, data.outletId)))
      throw new Error("Only the active outlet manager or headquarters can test WhatsApp alerts");
    const { dispatchWhatsAppTest } = await import("@/lib/whatsapp.server");
    return dispatchWhatsAppTest(data.outletId);
  });
