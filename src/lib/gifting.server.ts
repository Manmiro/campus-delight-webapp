import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";
import { paystackInitialize, paystackVerify } from "./payments.server";
import { verifiedPaymentMatches } from "./payment-rules";
import { recipientDisplayName, type GiftInput, type GiftRecipient } from "./gifting-rules";

// Proposed schema stays isolated until approved and generated types are refreshed.
export type GiftRecord = {
  reference: string;
  customer_id: string;
  outlet_id: string;
  kind: string;
  amount_kobo: number;
  sponsor_name: string;
  sponsor_email: string;
  note: string;
  selection: Json;
  status: string;
  wallet_fallback: boolean;
  related_id: string | null;
  payload: Json | null;
  created_at: string;
  verified_at: string | null;
};
type GiftDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      gift_payments: {
        Row: GiftRecord;
        Insert: GiftRecord;
        Update: Partial<GiftRecord>;
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      prepare_gift_payment: { Args: { p_reference: string; p_input: Json }; Returns: number };
      settle_verified_gift: {
        Args: { p_reference: string; p_amount_kobo: number; p_currency: string; p_payload: Json };
        Returns: Json;
      };
    };
  };
};
export const giftDb = supabaseAdmin as unknown as SupabaseClient<GiftDatabase>;
export type GiftSettlement = {
  applied: boolean;
  status: string;
  already?: boolean;
  kind?: string;
  walletFallback?: boolean;
  emailStatus?: "sent" | "unavailable";
};

function publicError(error: { code?: string; message: string }): never {
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? ""))
    throw new Error("Gifting checkout is being prepared. Please try again later.");
  // Database business-rule messages contain no profile or payment details.
  if (error.code === "P0001") throw new Error(error.message);
  throw new Error("Gifting is temporarily unavailable. Please try again.");
}

export function giftOrigin(value: string) {
  const origin = new URL(value);
  const allowed = [
    "https://campusdelight.net",
    "https://www.campusdelight.net",
    process.env["LOVABLE_APP_ORIGIN"],
  ];
  if (
    allowed.includes(origin.origin) ||
    (origin.protocol === "https:" && origin.hostname.endsWith(".lovable.app")) ||
    (["http:", "https:"].includes(origin.protocol) &&
      ["localhost", "127.0.0.1"].includes(origin.hostname))
  )
    return origin.origin;
  throw new Error("Invalid payment return address");
}

async function verifyCaptcha(token: string) {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  if (!secret) throw new Error("Gifting security verification is not configured yet.");
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token }),
    signal: AbortSignal.timeout(10000),
  });
  const result = (await response.json()) as {
    success?: boolean;
    action?: string;
    hostname?: string;
  };
  if (!response.ok || !result.success || result.action !== "gift" || !result.hostname)
    throw new Error("Security verification expired. Please try again.");
  giftOrigin(`https://${result.hostname}`);
}

export async function lookupRecipient(
  foodieId: string,
  captchaToken: string,
): Promise<GiftRecipient | null> {
  await verifyCaptcha(captchaToken);
  const { data: p, error } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name,gender,avatar_url,outlet_id")
    .eq("customer_code", foodieId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) publicError(error);
  if (!p?.outlet_id) return null;
  const [role, outlet, prices, menu] = await Promise.all([
    supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", p.id)
      .eq("role", "customer")
      .maybeSingle(),
    supabaseAdmin
      .from("outlets")
      .select("id,name,delivery_fee_kobo")
      .eq("id", p.outlet_id)
      .eq("status", "active")
      .maybeSingle(),
    supabaseAdmin
      .from("outlet_plan_prices")
      .select("plan,tier,price_kobo")
      .eq("outlet_id", p.outlet_id)
      .eq("is_active", true)
      .gt("price_kobo", 0),
    supabaseAdmin
      .from("menu_items")
      .select("id,name,description,price_kobo,image_url")
      .eq("outlet_id", p.outlet_id)
      .eq("is_available", true)
      .gt("price_kobo", 0)
      .order("name"),
  ]);
  for (const result of [role, outlet, prices, menu]) if (result.error) publicError(result.error);
  if (!role.data || !outlet.data) return null;
  let avatarUrl: string | null = null;
  // Only sign this student's own private avatar path, never a supplied storage path.
  if (p.avatar_url?.startsWith(`${p.id}/`)) {
    const signed = await supabaseAdmin.storage.from("avatars").createSignedUrl(p.avatar_url, 300);
    avatarUrl = signed.data?.signedUrl ?? null;
  }
  return {
    foodieId,
    name: recipientDisplayName(p.full_name),
    gender: p.gender,
    avatarUrl,
    outlet: {
      id: outlet.data.id,
      name: outlet.data.name,
      deliveryFeeKobo: outlet.data.delivery_fee_kobo,
    },
    prices: prices.data ?? [],
    menu: menu.data ?? [],
  };
}

export async function startGift(input: GiftInput) {
  const origin = giftOrigin(input.origin);
  await verifyCaptcha(input.captchaToken);
  // Check configuration before persisting a payment intent.
  if (!process.env["PAYSTACK_SECRET_KEY"])
    throw new Error("Paystack payments are not configured yet");
  const reference = `CDG-${crypto.randomUUID()}`;
  const { captchaToken: _token, origin: _origin, ...selection } = input;
  const { data: amount, error } = await giftDb.rpc("prepare_gift_payment", {
    p_reference: reference,
    p_input: selection as Json,
  });
  if (error) publicError(error);
  const authorizationUrl = await paystackInitialize({
    reference,
    email: input.sponsorEmail,
    amountKobo: Number(amount),
    callbackUrl: `${origin}/feed-someone?reference=${encodeURIComponent(reference)}`,
  });
  return { reference, authorizationUrl };
}

export async function settleGift(
  reference: string,
  retryEmailOnFailure = false,
): Promise<GiftSettlement> {
  const { data: gift, error } = await giftDb
    .from("gift_payments")
    .select("amount_kobo,status,kind,wallet_fallback")
    .eq("reference", reference)
    .maybeSingle();
  if (error) publicError(error);
  if (!gift) return { applied: false, status: "unknown_reference" };
  // Successful committed receipts can be refreshed without another network verification.
  let settlement: GiftSettlement;
  if (gift.status === "success")
    settlement = {
      applied: true,
      status: "success",
      already: true,
      kind: gift.kind,
      walletFallback: gift.wallet_fallback,
    };
  else {
    const verified = await paystackVerify(reference);
    if (!verifiedPaymentMatches({ reference, amountKobo: gift.amount_kobo }, verified))
      return {
        applied: false,
        status: verified.status === "success" ? "verification_mismatch" : verified.status,
      };
    const result = await giftDb.rpc("settle_verified_gift", {
      p_reference: reference,
      p_amount_kobo: verified.amount,
      p_currency: verified.currency,
      p_payload: verified as Json,
    });
    if (result.error) publicError(result.error);
    settlement = result.data as GiftSettlement;
  }
  if (settlement.applied) {
    const { emailGift } = await import("./gifting-emails.server");
    // Failed delivery propagates to the signed webhook for retry, after settlement.
    // Return-page retries are safe: each recipient's email has its own send claim.
    try {
      await emailGift(reference);
      settlement.emailStatus = "sent";
    } catch {
      settlement.emailStatus = "unavailable";
      if (retryEmailOnFailure) throw new Error("Gift settled; confirmation email needs retry");
    }
  }
  return settlement;
}
