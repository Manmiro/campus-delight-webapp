import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Requests a 5-digit OTP (5-minute expiry, single use). Returns the code for
 * demo delivery until an SMS gateway is connected — never logged server-side. */
export const requestOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("request_otp", { p_purpose: "food_credit" });
    if (error) throw new Error(error.message);
    return data as string;
  });
