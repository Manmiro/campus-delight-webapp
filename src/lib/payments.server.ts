import { createClient } from "@supabase/supabase-js";

const PAYSTACK_BASE = "https://api.paystack.co";

function serverDb() {
  return createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function paystackInitialize(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
}) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["PAYSTACK_SECRET_KEY"]}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      currency: "NGN",
      callback_url: input.callbackUrl,
    }),
  });
  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: { authorization_url: string };
  };
  if (!json.status || !json.data) throw new Error(json.message || "Paystack initialization failed");
  return json.data.authorization_url;
}

export async function paystackVerify(reference: string) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env["PAYSTACK_SECRET_KEY"]}` },
  });
  const json = (await res.json()) as {
    status: boolean;
    data?: { status: string; amount: number; reference: string };
    message?: string;
  };
  if (!json.status || !json.data) throw new Error(json.message || "Paystack verification failed");
  return json.data;
}

/**
 * Verifies a payment reference with Paystack and applies it idempotently.
 * A browser redirect alone never credits anything — only this verified path does.
 */
export async function applyVerifiedPayment(reference: string) {
  const db = serverDb();
  const verified = await paystackVerify(reference);
  if (verified.status !== "success") {
    await db
      .from("payment_transactions")
      .update({ status: "failed", verified_at: new Date().toISOString(), payload: verified })
      .eq("paystack_reference", reference);
    return { applied: false, status: "failed", purpose: null as string | null };
  }

  const { data: tx } = await db
    .from("payment_transactions")
    .select("id, customer_id, purpose, amount_kobo, status, related_id")
    .eq("paystack_reference", reference)
    .maybeSingle();
  if (!tx) return { applied: false, status: "unknown_reference", purpose: null };
  if (tx.status === "success") return { applied: true, status: "success", purpose: tx.purpose, already: true };
  if (verified.amount < tx.amount_kobo) {
    await db.from("payment_transactions").update({ status: "failed", payload: verified }).eq("id", tx.id);
    return { applied: false, status: "amount_mismatch", purpose: tx.purpose };
  }

  await db
    .from("payment_transactions")
    .update({ status: "success", verified_at: new Date().toISOString(), payload: verified })
    .eq("id", tx.id);

  if (tx.purpose === "wallet_funding") {
    await db.rpc("apply_wallet_funding", {
      p_customer_id: tx.customer_id,
      p_amount_kobo: tx.amount_kobo,
      p_reference: reference,
    });
  } else if (tx.purpose === "subscription" && tx.related_id) {
    await db.rpc("activate_subscription", { p_subscription_id: tx.related_id, p_reference: reference });
  }

  return { applied: true, status: "success", purpose: tx.purpose };
}

export async function verifyWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const secret = process.env["PAYSTACK_SECRET_KEY"];
  if (!secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === signature;
}
