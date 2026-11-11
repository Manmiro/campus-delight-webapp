import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { smsPhone } from "@/lib/sms-rules";

/** The code stays server-side; only delivery acceptance is returned. */
export const requestOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const key = process.env["PINGRAM_API_KEY"];
    if (!key) throw new Error("Phone verification SMS is not configured yet");
    const { data: profile, error: profileError } = await context.supabase.from("profiles").select("phone, is_active").eq("id", context.userId).single();
    if (profileError || !profile?.is_active || !profile.phone) throw new Error("Add a valid phone number to your profile first");
    smsPhone(profile.phone);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendVerificationSms } = await import("@/lib/sms.server");
    const { data, error } = await supabaseAdmin.rpc("issue_sms_otp", { p_customer: context.userId });
    if (error) throw new Error(error.message);
    if (!data || typeof data !== "object" || Array.isArray(data) || typeof data["code"] !== "string" || typeof data["phone"] !== "string" || typeof data["id"] !== "string") throw new Error("Could not create verification code");
    try {
      await sendVerificationSms(key, data["phone"], data["code"]);
    } catch (error) {
      await supabaseAdmin.from("otp_codes").update({ consumed: true }).eq("id", data["id"]).eq("customer_id", context.userId);
      // Provider details are already logged server-side; customers get a plain explanation.
      throw new Error(customerSmsError(error));
    }
    return { accepted: true };
  });

export function customerSmsError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/usage_limit_reached|\[402\]/.test(message)) return "Verification texts are paused for now. Please try again later.";
  if (message.startsWith("Enter a valid")) return message;
  return "We couldn't send your verification text right now. Please try again in a few minutes.";
}
