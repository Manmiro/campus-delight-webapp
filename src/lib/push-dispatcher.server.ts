import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { sendWebPush } from "./web-push.server";

type StoredSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type OrderSnapshot = {
  id: string;
  reference: string;
  outlet_id: string;
  fulfillment_method: string;
  delivery_address: string | null;
  status: string;
  order_items: { item_name: string; quantity: number }[];
  outlet: { name: string; manager_push_policy: "on" | "off" | "locked" } | null;
};

function pushBody(order: OrderSnapshot) {
  const items =
    order.order_items.map((item) => `${item.item_name} ×${item.quantity}`).join(", ") ||
    "Meal order";
  const destination =
    order.fulfillment_method === "delivery"
      ? order.delivery_address?.trim() || "Delivery address not provided"
      : `Pickup at ${order.outlet?.name || "the outlet"}`;
  return {
    title: "New Campus Delight Order",
    body: `${order.reference}: ${items} to ${destination}`,
    announcement: "You have a new Campus Delight order, check and fulfill.",
    orderId: order.id,
    reference: order.reference,
    itemsSummary: items,
    destination,
    url: "/outlet/orders",
    icon: "/apple-touch-icon.png",
    badge: "/favicon.png",
    tag: `campus-delight-order-${order.id}`,
    vibration: [250, 120, 250],
  };
}

async function recipientsForOutlet(
  outletId: string,
  targetUserId?: string,
): Promise<StoredSubscription[]> {
  const [managers, hqUsers, subscriptions] = await Promise.all([
    db
      .from("outlet_staff")
      .select("user_id")
      .eq("outlet_id", outletId)
      .eq("staff_role", "outlet_manager")
      .eq("status", "active"),
    db.from("user_roles").select("user_id").eq("role", "central_admin"),
    db
      .from("manager_push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth")
      .eq("outlet_id", outletId)
      .eq("enabled", true),
  ]);
  if (managers.error) throw new Error(managers.error.message);
  if (hqUsers.error) throw new Error(hqUsers.error.message);
  if (subscriptions.error) throw new Error(subscriptions.error.message);
  const allowedUsers = new Set([
    ...(managers.data ?? []).map((row) => row.user_id),
    ...(hqUsers.data ?? []).map((row) => row.user_id),
  ]);
  return ((subscriptions.data ?? []) as StoredSubscription[]).filter(
    (row) => allowedUsers.has(row.user_id) && (!targetUserId || row.user_id === targetUserId),
  );
}

async function dispatchSubscriptions(subscriptions: StoredSubscription[], payload: unknown) {
  let sent = 0;
  let gone = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    try {
      const result = await sendWebPush(subscription, payload);
      if (result === "gone") {
        gone++;
        await db.from("manager_push_subscriptions").delete().eq("id", subscription.id);
      } else {
        sent++;
      }
    } catch (error) {
      failed++;
      console.warn("Manager push delivery failed", {
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : error,
      });
    }
  }
  return { sent, gone, failed };
}

export async function dispatchConfirmedOrderPush(orderId: string) {
  const { data, error } = await db
    .from("orders")
    .select(
      "id,reference,outlet_id,fulfillment_method,delivery_address,status,order_items(item_name,quantity),outlet:outlets(name,manager_push_policy)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const order = data as unknown as OrderSnapshot | null;
  if (!order || order.status !== "confirmed" || order.outlet?.manager_push_policy !== "on") {
    return { sent: 0, gone: 0, failed: 0, skipped: true };
  }
  const subscriptions = await recipientsForOutlet(order.outlet_id);
  return dispatchSubscriptions(subscriptions, pushBody(order));
}

export async function dispatchManagerPushTest(outletId: string, targetUserId?: string) {
  const { data: outlet, error } = await db
    .from("outlets")
    .select("name,manager_push_policy")
    .eq("id", outletId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!outlet) throw new Error("Outlet not found");
  if (outlet.manager_push_policy !== "on")
    throw new Error("Headquarters has disabled push notifications for this outlet");
  const subscriptions = await recipientsForOutlet(outletId, targetUserId);
  return dispatchSubscriptions(subscriptions, {
    title: "Campus Delight test alert",
    body: `Kitchen alerts are working for ${outlet.name}. Tap to open outlet orders.`,
    announcement: "You have a new Campus Delight order, check and fulfill.",
    url: "/outlet/orders",
    icon: "/apple-touch-icon.png",
    badge: "/favicon.png",
    tag: `campus-delight-test-${outletId}`,
    vibration: [250, 120, 250],
  });
}
