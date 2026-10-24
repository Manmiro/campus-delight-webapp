import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { paymentInput, type PaymentInput } from "@/lib/payment-rules";
import { z } from "zod";

export const initializePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PaymentInput) => paymentInput.parse(input))
  .handler(async ({ data, context }) => {
    const { startPayment } = await import("@/lib/payments.server");
    const { data: profile, error } = await context.supabase.from("profiles").select("email, outlet_id, is_active").eq("id", context.userId).single();
    if (error || !profile?.email || !profile.is_active || !profile.outlet_id) throw new Error("An active account with an assigned outlet is required");
    return startPayment(data, context.userId, profile.email, profile.outlet_id);
  });

export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reference: string }) => z.object({ reference: z.string().min(1).max(100).regex(/^[A-Za-z0-9-]+$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: tx } = await context.supabase.from("payment_transactions").select("id").eq("customer_id", context.userId).eq("paystack_reference", data.reference).maybeSingle();
    if (!tx) throw new Error("Payment reference not found for your account");
    const { applyVerifiedPayment } = await import("@/lib/payments.server");
    return applyVerifiedPayment(data.reference);
  });
