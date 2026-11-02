import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const setOutletOrderAlarm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: assignment, error: assignmentError } = await context.supabase
      .from("outlet_staff")
      .select("outlet_id")
      .eq("user_id", context.userId)
      .eq("staff_role", "outlet_manager")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (assignmentError) throw new Error(assignmentError.message);
    if (!assignment) throw new Error("Only an active outlet manager can change this alarm");

    const { error } = await context.supabase
      .from("profiles")
      .update({ outlet_order_alarm_enabled: data.enabled })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { enabled: data.enabled, outletId: assignment.outlet_id };
  });
