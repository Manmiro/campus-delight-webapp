import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { orderAlertHtml, parseStartCommand, telegramLinkUrls } from "@/lib/telegram-rules";

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
  payment_method: string;
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
  const code = `${purpose === "group" ? "g" : "p"}${randomBytes(31).toString("base64url")}`;
  const codeHash = createHash("sha256").update(code).digest("hex");
  const { error } = await db.from("telegram_link_codes").insert({
    code_hash: codeHash,
    created_by: userId,
    outlet_id: outletId,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  const urls = telegramLinkUrls(username, code);
  return {
    url: purpose === "group" ? urls.groupUrl : urls.personalUrl,
    expiresInMinutes: 15,
  };
}

export async function getTelegramConnectionStatus(outletId: string, userId?: string) {
  let query = db
    .from("outlet_telegram_chats")
    .select("chat_type")
    .eq("outlet_id", outletId)
  if (userId) query = query.eq("linked_by", userId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const chats = data ?? [];
  return {
    privateConnected: chats.some((chat) => chat.chat_type === "private"),
    groupCount: chats.filter((chat) => chat.chat_type !== "private").length,
  };
}

async function sendToChats(outletId: string, text: string, connectedBy?: string, orderId?: string) {
  const chatsQuery = db
    .from("outlet_telegram_chats")
    .select("id,chat_id")
    .eq("outlet_id", outletId);
  const query = connectedBy ? chatsQuery.eq("linked_by", connectedBy) : chatsQuery;
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data?.length) return { sent: 0, failed: 0, registered: 0 };

  if (orderId) {
    const { error: claimError } = await db
      .from("telegram_order_alert_claims")
      .insert({ order_id: orderId });
    if (claimError?.code === "23505") return { sent: 0, failed: 0, registered: data.length, skipped: true };
    if (claimError) throw new Error(claimError.message);
  }

  let sent = 0;
  let failed = 0;
  for (const chat of data ?? []) {
    try {
      await telegramApi("sendMessage", {
        chat_id: chat.chat_id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      sent++;
    } catch (sendError) {
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
      "id,reference,outlet_id,fulfillment_method,delivery_address,status,total_kobo,payment_method,order_items(item_name,quantity),customer:profiles(full_name,customer_code),outlet:outlets(name)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const order = data as unknown as TelegramOrder | null;
  if (!order || order.status !== "confirmed")
    return { sent: 0, failed: 0, registered: 0, skipped: true };
  return sendToChats(
    order.outlet_id,
    orderAlertHtml({
      reference: order.reference,
      outletName: order.outlet?.name ?? "the outlet",
      items: order.order_items,
      fulfillmentMethod: order.fulfillment_method,
      deliveryAddress: order.delivery_address,
      totalKobo: order.total_kobo,
      paymentMethod: order.payment_method,
    }),
    undefined,
    order.id,
  );
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

async function reply(chatId: string, text: string) {
  await telegramApi("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const message = update.message;
  const chat = message?.chat;
  const text = message?.text;
  if (!chat || !text?.trim())
    return { handled: false };
  const parsed = parseStartCommand(text, botUsername());
  if (!parsed.isStart)
    return { handled: false };

  const chatId = String(chat.id);
  const payload = parsed.code;
  if (!payload) {
    await reply(
      chatId,
      "To connect this chat, open the Telegram link from your Campus Delight manager dashboard, then press Start.",
    );
    return { handled: true, connected: false };
  }

  const { data: link, error: linkError } = await db
    .from("telegram_link_codes")
    .select("code_hash,created_by,outlet_id,expires_at,used_at,outlet:outlets(name)")
    .eq("code_hash", createHash("sha256").update(payload).digest("hex"))
    .gt("expires_at", new Date().toISOString())
    .is("used_at", null)
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
      .eq("user_id", link.created_by)
      .eq("outlet_id", link.outlet_id)
      .eq("staff_role", "outlet_manager")
      .maybeSingle(),
    db
      .from("user_roles")
      .select("user_id")
      .eq("user_id", link.created_by)
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

  const connectionPurpose = payload.startsWith("g") ? "group" : "private";
  if (
    (connectionPurpose === "private" && chat.type !== "private") ||
    (connectionPurpose === "group" && chat.type === "private")
  ) {
    await reply(
      chatId,
      connectionPurpose === "group"
        ? "Please use Add to kitchen group and select the kitchen group in Telegram."
        : "Please open this link in a private chat with the Campus Delight bot.",
    );
    return { handled: true, connected: false };
  }

  const { data: existing, error: existingError } = await db
      .from("outlet_telegram_chats")
      .select("outlet_id")
      .eq("chat_id", Number(chatId))
      .limit(10);
  if (existingError) throw new Error(existingError.message);
  if ((existing ?? []).some((row) => row.outlet_id !== link.outlet_id)) {
    await reply(
      chatId,
      "This Telegram chat is already connected to another outlet. Ask headquarters to move it before reconnecting.",
    );
    return { handled: true, connected: false };
  }

  const { data: consumed, error: consumeError } = await db.rpc("consume_telegram_link_code", {
    p_code_hash: createHash("sha256").update(payload).digest("hex"),
  });
  if (consumeError) throw new Error(consumeError.message);
  if (!consumed) {
    await reply(
      chatId,
      "That connection link has already been used. Please generate a new one from the Campus Delight dashboard.",
    );
    return { handled: true, connected: false };
  }

  const { error: chatError } = await db.from("outlet_telegram_chats").upsert(
    {
      chat_id: Number(chatId),
      outlet_id: link.outlet_id,
      linked_by: link.created_by,
      chat_type: chat.type,
      chat_title: chat.title ?? null,
    },
    { onConflict: "outlet_id,chat_id" },
  );
  if (chatError) throw new Error(chatError.message);

  const outletName = (link.outlet as { name?: string } | null)?.name ?? "your outlet";
  await reply(
    chatId,
    chat.type !== "private"
      ? `✅ Kitchen group connected to ${outletName}. New confirmed orders will appear here.`
      : `✅ Telegram connected to ${outletName}. I’ll send new confirmed order alerts here.`,
  );
  return { handled: true, connected: true };
}
