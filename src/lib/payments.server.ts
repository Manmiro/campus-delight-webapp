import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { verifiedPaymentMatches, type PaymentInput } from "@/lib/payment-rules";
import type { Json } from "@/integrations/supabase/types";

const PAYSTACK_BASE = "https://api.paystack.co";
function paymentSecret() {
  const secret = process.env["PAYSTACK_SECRET_KEY"];
  if (!secret) throw new Error("Card payments are not configured yet");
  return secret;
}

export async function startCardPayment(input: PaymentInput, customerId: string, email: string, outletId: string) {
  paymentSecret();
  const origin = new URL(input.origin);
  // Only return to this app; never accept an arbitrary external callback.
  const allowed = ["https://campus-delight-webapp.lovable.app", "https://id-preview--26e23df5-ee2e-4a9c-9175-3fb980bfd92d.lovable.app", process.env["LOVABLE_APP_ORIGIN"]];
  if (!allowed.includes(origin.origin) && !(origin.hostname === "localhost" && origin.port === "8080")) throw new Error("Invalid payment return address");
  const reference = `CDPS-${crypto.randomUUID()}`;
  let amountKobo = input.amountKobo ?? 0;
  let relatedId = input.relatedId;
  if (input.purpose === "order_payment") {
    if (!input.items) throw new Error("Order items required");
    const { data, error } = await db.rpc("prepare_card_order", { p_customer_id: customerId, p_items: input.items, p_reference: reference });
    if (error || !data) throw new Error(error?.message ?? "Could not prepare order");
    relatedId = data;
    const { data: order, error: orderError } = await db.from("orders").select("total_kobo").eq("id", data).single();
    if (orderError || !order) throw new Error("Could not read order total");
    amountKobo = order.total_kobo;
  } else {
    if (input.purpose === "subscription") {
      const { data: sub, error } = await db.from("subscriptions").select("id,plan,tier,status,outlet_id").eq("id", input.relatedId ?? "").eq("customer_id", customerId).single();
      if (error || !sub || sub.outlet_id !== outletId || !["awaiting_payment", "renewal_pending"].includes(sub.status)) throw new Error("Subscription is not awaiting payment");
      const { data: price, error: priceError } = await db.from("outlet_plan_prices").select("price_kobo").eq("outlet_id", outletId).eq("plan", sub.plan).eq("tier", sub.tier).eq("is_active", true).single();
      if (priceError || !price) throw new Error("This plan is not available at your outlet");
      amountKobo = price.price_kobo;
      const { error: updateError } = await db.from("subscriptions").update({ price_kobo: amountKobo }).eq("id", sub.id);
      if (updateError) throw new Error(updateError.message);
    }
    if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) throw new Error("Invalid amount");
    const { error } = await db.from("payment_transactions").insert({ customer_id: customerId, purpose: input.purpose, amount_kobo: amountKobo, paystack_reference: reference, status: "pending", related_id: relatedId ?? null });
    if (error) throw new Error(error.message);
  }
  try {
    const authorizationUrl = await paystackInitialize({ email, amountKobo, reference, callbackUrl: `${origin.origin}/payment/callback` });
    return { authorizationUrl, reference };
  } catch (error) {
    await db.from("payment_transactions").update({ status: "failed" }).eq("paystack_reference", reference);
    throw error;
  }
}

export async function paystackInitialize(input: { email: string; amountKobo: number; reference: string; callbackUrl: string }) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${paymentSecret()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, amount: input.amountKobo, reference: input.reference, currency: "NGN", channels: ["card"], callback_url: input.callbackUrl }),
  });
  const json = await res.json() as { status: boolean; message: string; data?: { authorization_url: string } };
  if (!res.ok || !json.status || !json.data) throw new Error(json.message || "Could not start card payment");
  return json.data.authorization_url;
}

export async function paystackVerify(reference: string) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${paymentSecret()}` } });
  const json = await res.json() as { status: boolean; data?: { status: string; amount: number; reference: string; currency: string }; message?: string };
  if (!res.ok || !json.status || !json.data) throw new Error(json.message || "Paystack verification failed");
  return json.data;
}

export async function applyVerifiedPayment(reference: string) {
  const { data: tx, error } = await db.from("payment_transactions").select("amount_kobo,purpose").eq("paystack_reference", reference).maybeSingle();
  if (error) throw new Error(error.message);
  if (!tx) return { applied: false, status: "unknown_reference", purpose: null };
  const verified = await paystackVerify(reference);
  if (!verifiedPaymentMatches({ reference, amountKobo: tx.amount_kobo }, verified)) return { applied: false, status: verified.status === "success" ? "verification_mismatch" : verified.status, purpose: tx.purpose };
  const { data, error: settlementError } = await db.rpc("settle_verified_payment", { p_reference: reference, p_amount_kobo: verified.amount, p_currency: verified.currency, p_payload: verified as Json });
  if (settlementError) throw new Error(settlementError.message);
  return data as { applied: boolean; status: string; purpose: string | null; already?: boolean };
}

export async function verifyWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const secret = process.env["PAYSTACK_SECRET_KEY"];
  if (!secret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  let difference = 0;
  for (let i = 0; i < hex.length; i++) difference |= hex.charCodeAt(i) ^ signature.toLowerCase().charCodeAt(i);
  return difference === 0;
}
