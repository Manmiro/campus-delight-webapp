import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AuthenticatedSupabase = SupabaseClient<Database>;

async function isCentralAdmin(supabase: AuthenticatedSupabase) {
  const { data, error } = await supabase.rpc("is_central_admin");
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function canManageOutlet(supabase: AuthenticatedSupabase, outletId: string) {
  if (await isCentralAdmin(supabase)) return true;
  const { data, error } = await supabase.rpc("is_outlet_manager", { _outlet_id: outletId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

const outletInput = z.object({ outletId: z.string().uuid() });

export const createTelegramConnectionLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    outletInput.extend({ purpose: z.enum(["private", "group"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    if (!(await canManageOutlet(context.supabase, data.outletId)))
      throw new Error("Only an outlet manager or headquarters can connect Telegram");
    const { createTelegramConnectionLink: createLink } = await import("@/lib/telegram.server");
    return createLink(context.userId, data.outletId, data.purpose);
  });

export const getTelegramConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => outletInput.parse(input))
  .handler(async ({ context, data }) => {
    const central = await isCentralAdmin(context.supabase);
    if (!central && !(await canManageOutlet(context.supabase, data.outletId)))
      throw new Error("Only an outlet manager or headquarters can view Telegram status");
    const { getTelegramConnectionStatus: getStatus } = await import("@/lib/telegram.server");
    return getStatus(data.outletId, central ? undefined : context.userId);
  });

export const sendTelegramTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => outletInput.parse(input))
  .handler(async ({ context, data }) => {
    const central = await isCentralAdmin(context.supabase);
    if (!central && !(await canManageOutlet(context.supabase, data.outletId)))
      throw new Error("Only an outlet manager or headquarters can test Telegram");
    const { dispatchTelegramTest } = await import("@/lib/telegram.server");
    return dispatchTelegramTest(data.outletId, central ? undefined : context.userId);
  });
