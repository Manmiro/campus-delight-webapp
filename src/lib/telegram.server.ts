import { randomBytes } from "node:crypto";
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";

type TelegramPurpose = "private" | "group";
type TelegramChatType = "private" | "group" | "supergroup";

type TelegramOrder = {
  id: string;
  reference: string;
  outlet_id: string;
  fulfillment_method: string;
  delivery_address: string | null;
  status: string;
  total_kobo: number;
  order_items: { item_name: string; quantity: number }[];
  customer: { full_name: string; customer_code: string } | null;
  outlet: { name: string } | null;
};

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id: number | string; type: TelegramChatType; title?: string; username?: string };
  };
};

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} environment variable`);
  return value;
}

function botUsername() {
  return env("TELEGRAM_BOT_USERNAME").replace(/^@/, "");
}

async function telegramApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = env("TELEGRAM_BOT_TOKEN");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json()) as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !payload.ok)
    throw new Error(`Telegram ${method} failed: ${payload.description ?? response.statusText}`);
  return payload.result as T;
}

export function verifyTelegramWebhookSecret(value: string | null) {
  const configured = process.env["TELEGRAM_WEBHOOK_SECRET"]?.trim();
  return Boolean(configured && value && value === configured);
}

export async function createTelegramConnectionLink(
  userId: string,
  outletId: string,
  purpose: TelegramPurpose,
) {
  const username = botUsername();
  const token = randomBytes(32).toString("base64url");
  const { error } = await db.from("telegram_link_tokens").insert({
    token,
    user_id: userId,
    outlet_id: outletId,
    purpose,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  const parameter = purpose === "group" ? "startgroup" : "start";
  return {
    url: `https://t.me/${username}?${parameter}=${encodeURIComponent(token)}`,
    expiresInMinutes: 15,
  };
}

export async function getTelegramConnectionStatus(outletId: string, userId?: string) {
  let query = db
    .from("telegram_chats")
    .select("chat_type")
    .eq("outlet_id", outletId)
    .eq("active", true);
  if (userId) query = query.eq("connected_by", userId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const chats = data ?? [];
  return {
    privateConnected: chats.some((chat) => chat.chat_type === "private"),
    groupCount: chats.filter((chat) => chat.chat_type !== "private").length,
  };
}

function orderMessage(order: TelegramOrder) {
  const items =
    order.order_items.map((item) => `${item.item_name} ×${item.quantity}`).join(", ") ||
    "Meal order";
  const destination =
    order.fulfillment_method === "delivery"
      ? order.delivery_address?.trim() || "Delivery address not provided"
      : `Pickup at ${order.outlet?.name ?? "the outlet"}`;
  return [
    "🍽️ New Campus Delight order",
    order.reference,
    `Customer: ${order.customer?.full_name ?? "Customer"} (${order.customer?.customer_code ?? "—"})`,
    `Items: ${items}`,
    `Destination: ${destination}`,
    `Total: ₦${(order.total_kobo / 100).toLocaleString("en-NG")}`,
    "Open the dashboard to fulfill or cancel this order.",
  ].join("\n");
}

async function sendToChats(outletId: string, text: string, connectedBy?: string, orderId?: string) {
  let query = db
    .from("telegram_chats")
    .select("id,chat_id")
    .eq("outlet_id", outletId)
    .eq("active", true);
  if (connectedBy) query = query.eq("connected_by", connectedBy);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let sent = 0;
  let failed = 0;
  for (const chat of data ?? []) {
    if (orderId) {
      const { error: claimError } = await db
        .from("telegram_order_alert_claims")
        .insert({ order_id: orderId, chat_id: chat.chat_id });
      if (claimError?.code === "23505") continue;
      if (claimError) throw new Error(claimError.message);
    }
    try {
      await telegramApi("sendMessage", {
        chat_id: chat.chat_id,
        text,
        disable_web_page_preview: true,
      });
      sent++;
    } catch (sendError) {
      if (orderId)
        await db
          .from("telegram_order_alert_claims")
          .delete()
          .eq("order_id", orderId)
          .eq("chat_id", chat.chat_id);
      failed++;
      console.warn("Telegram delivery failed", {
        chatId: chat.chat_id,
        error: sendError instanceof Error ? sendError.message : sendError,
      });
    }
  }
  return { sent, failed, registered: (data ?? []).length };
}

export async function dispatchConfirmedOrderTelegram(orderId: string) {
  const { data, error } = await db
    .from("orders")
    .select(
      "id,reference,outlet_id,fulfillment_method,delivery_address,status,total_kobo,order_items(item_name,quantity),customer:profiles(full_name,customer_code),outlet:outlets(name)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const order = data as unknown as TelegramOrder | null;
  if (!order || order.status !== "confirmed")
    return { sent: 0, failed: 0, registered: 0, skipped: true };
  return sendToChats(order.outlet_id, orderMessage(order), undefined, order.id);
}

export async function dispatchTelegramTest(outletId: string, connectedBy?: string) {
  const { data: outlet, error } = await db
    .from("outlets")
    .select("name")
    .eq("id", outletId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!outlet) throw new Error("Outlet not found");
  return sendToChats(
    outletId,
    `✅ Campus Delight Telegram test\nAlerts are working for ${outlet.name}.`,
    connectedBy,
  );
}

function startPayload(text: string) {
  return text.trim().match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/i)?.[1] ?? null;
}

async function reply(chatId: string, text: string) {
  await telegramApi("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const message = update.message;
  const chat = message?.chat;
  const text = message?.text;
  if (!chat || !text?.trim() || !text.trim().toLowerCase().startsWith("/start"))
    return { handled: false };

  const chatId = String(chat.id);
  const payload = startPayload(text);
  if (!payload) {
    await reply(
      chatId,
      "To connect this chat, open the Telegram link from your Campus Delight manager dashboard, then press Start.",
    );
    return { handled: true, connected: false };
  }

  const { data: link, error: linkError } = await db
    .from("telegram_link_tokens")
    .select("token,user_id,outlet_id,purpose,expires_at,consumed_at,outlet:outlets(name)")
    .eq("token", payload)
    .gt("expires_at", new Date().toISOString())
    .is("consumed_at", null)
    .maybeSingle();
  if (linkError) throw new Error(linkError.message);
  if (!link) {
    await reply(
      chatId,
      "That connection link has expired or was already used. Please generate a new one from the Campus Delight dashboard.",
    );
    return { handled: true, connected: false };
  }

  const [manager, headquarters] = await Promise.all([
    db
      .from("outlet_staff")
      .select("id")
      .eq("user_id", link.user_id)
      .eq("outlet_id", link.outlet_id)
      .eq("staff_role", "outlet_manager")
      .maybeSingle(),
    db
      .from("user_roles")
      .select("user_id")
      .eq("user_id", link.user_id)
      .eq("role", "central_admin")
      .maybeSingle(),
  ]);
  if (manager.error) throw new Error(manager.error.message);
  if (headquarters.error) throw new Error(headquarters.error.message);
  if (!manager.data && !headquarters.data) {
    await reply(
      chatId,
      "This dashboard connection is no longer authorized. Generate a new link after your manager access is restored.",
    );
    return { handled: true, connected: false };
  }

  if (
    (link.purpose === "private" && chat.type !== "private") ||
    (link.purpose === "group" && chat.type === "private")
  ) {
    await reply(
      chatId,
      link.purpose === "group"
        ? "Please use Add to kitchen group and select the kitchen group in Telegram."
        : "Please open this link in a private chat with the Campus Delight bot.",
    );
    return { handled: true, connected: false };
  }

  const { data: existing, error: existingError } = await db
    .from("telegram_chats")
    .select("outlet_id,connected_by")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing && existing.outlet_id !== link.outlet_id) {
    await reply(
      chatId,
      "This Telegram chat is already connected to another outlet. Ask headquarters to move it before reconnecting.",
    );
    return { handled: true, connected: false };
  }

  const { data: consumed, error: consumeError } = await db
    .from("telegram_link_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", payload)
    .is("consumed_at", null)
    .select("token");
  if (consumeError) throw new Error(consumeError.message);
  if (!consumed?.length) {
    await reply(
      chatId,
      "That connection link has already been used. Please generate a new one from the Campus Delight dashboard.",
    );
    return { handled: true, connected: false };
  }

  const { error: chatError } = await db.from("telegram_chats").upsert(
    {
      chat_id: chatId,
      outlet_id: link.outlet_id,
      connected_by: link.user_id,
      chat_type: chat.type,
      title: chat.title ?? null,
      username: chat.username ?? null,
      active: true,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "chat_id" },
  );
  if (chatError) throw new Error(chatError.message);

  const outletName = (link.outlet as { name?: string } | null)?.name ?? "your outlet";
  await reply(
    chatId,
    link.purpose === "group"
      ? `✅ Kitchen group connected to ${outletName}. New confirmed orders will appear here.`
      : `✅ Telegram connected to ${outletName}. I’ll send new confirmed order alerts here.`,
  );
  return { handled: true, connected: true };
}
