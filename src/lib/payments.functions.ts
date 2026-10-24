import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyVerifiedPayment, paystackInitialize } from "@/lib/payments.server";
import { createClient } from "@supabase/supabase-js";

function adminDb() {
  return createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function newReference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/**
 * Starts a Paystack checkout. Creates a pending payment row first so the
 * webhook/verification has something idempotent to land on.
 */
export const initializePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { purpose: "wallet_funding" | "subscription"; amountKobo: number; relatedId?: string }) => input,
  )
  .handler(async ({ data, context }) => {
    if (!["wallet_funding", "subscription"].includes(data.purpose)) {
      throw new Error("Unsupported payment purpose");
    }
    if (!data.amountKobo || data.amountKobo <= 0) throw new Error("Invalid amount");

    const db = adminDb();
    const { data: profile } = await db
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();
    const email = profile?.email ?? context.userId;

    const reference = newReference("CDPS");
    const { error } = await db.from("payment_transactions").insert({
      customer_id: context.userId,
      purpose: data.purpose,
      amount_kobo: data.amountKobo,
      paystack_reference: reference,
      status: "pending",
      related_id: data.relatedId ?? null,
    });
    if (error) throw new Error(error.message);

    const origin = process.env["LOVABLE_APP_ORIGIN"] ?? "http://localhost:8080";
    const authorizationUrl = await paystackInitialize({
      email,
      amountKobo: data.amountKobo,
      reference,
      callbackUrl: `${origin}/payment/callback`,
    });
    return { authorizationUrl, reference };
  });

/** Public: verifies a payment reference server-side and applies it. */
export const verifyPayment = createServerFn({ method: "POST" })
  .inputValidator((input: { reference: string }) => input)
  .handler(async ({ data }) => {
    const result = await applyVerifiedPayment(data.reference);
    return result;
  });
