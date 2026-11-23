import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { orderAlertMessage, termiiPhone } from "./whatsapp-rules";

const ORDERS_URL = "https://www.campusdelight.net/outlet/orders";

async function sendTermiiWhatsApp(to: string, message: string) {
  const apiKey = process.env["TERMII_API_KEY"];
  const from = process.env["TERMII_SENDER_ID"];
  if (!apiKey || !from) throw new Error("WhatsApp alerts are not configured");
  const base = (process.env["TERMII_BASE_URL"] || "https://v3.api.termii.com").replace(/\/$/, "");
  const res = await fetch(`${base}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, to, from, sms: message, type: "plain", channel: "whatsapp" }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const safe = (await res.text()).split(apiKey).join("[redacted]").split(to).join("[redacted]");
    throw new Error(`Termii failed [${res.status}]: ${safe.slice(0, 300)}`);
  }
}

async function managerPhones(outletId: string): Promise<string[]> {
  const { data: staff, error } = await db.from("outlet_staff").select("user_id")
    .eq("outlet_id", outletId).eq("staff_role", "outlet_manager").eq("status", "active");
  if (error) throw new Error(error.message);
  const ids = (staff ?? []).map((r) => r.user_id);
  if (!ids.length) return [];
  const { data: profiles, error: pErr } = await db.from("profiles").select("phone").in("id", ids);
  if (pErr) throw new Error(pErr.message);
  return [...new Set((profiles ?? []).map((p) => (p.phone ? termiiPhone(p.phone) : null)).filter((p): p is string => !!p))];
}

async function deliver(phones: string[], message: string) {
  let sent = 0, failed = 0;
  for (const phone of phones) {
    try { await sendTermiiWhatsApp(phone, message); sent++; }
    catch (e) { failed++; console.warn("WhatsApp alert failed", e instanceof Error ? e.message : e); }
  }
  return { sent, failed, recipients: phones.length };
}

export async function dispatchOrderWhatsApp(orderId: string, totalKobo: number | null) {
  const { data, error } = await db.from("orders")
    .select("reference,outlet_id,status,fulfillment_method,delivery_address,order_items(item_name,quantity),outlet:outlets(name)")
    .eq("id", orderId).maybeSingle();
  if (error) throw new Error(error.message);
  const order = data as unknown as { reference: string; outlet_id: string; status: string; fulfillment_method: string; delivery_address: string | null; order_items: { item_name: string; quantity: number }[]; outlet: { name: string } | null } | null;
  if (!order || order.status !== "confirmed") return { sent: 0, failed: 0, recipients: 0 };
  const items = order.order_items.map((i) => `${i.quantity}x ${i.item_name}`).join(", ") || "Meal order";
  const destination = order.fulfillment_method === "delivery"
    ? `Delivery: ${order.delivery_address?.trim() || "address not provided"}`
    : `Pickup at ${order.outlet?.name ?? "the outlet"}`;
  const phones = await managerPhones(order.outlet_id);
  return deliver(phones, orderAlertMessage({ reference: order.reference, items, destination, totalKobo, url: ORDERS_URL }));
}

export async function dispatchWhatsAppTest(outletId: string) {
  const phones = await managerPhones(outletId);
  return deliver(phones, `✅ Campus Delight WhatsApp alerts are working! New orders for your outlet will appear here.\n\n${ORDERS_URL}`);
}
