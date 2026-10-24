import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const roles = (data ?? []).map((r) => r.role);
    if (roles.includes("central_admin")) return "central_admin" as const;
    if (roles.includes("outlet_manager")) return "outlet_manager" as const;
    if (roles.includes("outlet_staff")) return "outlet_staff" as const;
    return "customer" as const;
  });
