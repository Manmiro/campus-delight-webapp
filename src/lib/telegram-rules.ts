/** Pure Telegram helpers shared by the webhook, dispatcher and tests. */

export const TELEGRAM_LINK_TTL_MINUTES = 15;
export const OUTLET_ORDERS_URL = "https://www.campusdelight.net/outlet/orders";

/** Telegram deep-link start parameters allow A-Z, a-z, 0-9, _ and - (max 64). */
const START_RE = /^\/start(?:@([A-Za-z0-9_]+))?(?:\s+([A-Za-z0-9_-]{16,64}))?\s*$/;

/** Returns the link code from "/start CODE" or "/start@bot CODE"; null otherwise. */
export function parseStartCommand(text: string | undefined, botUsername?: string): { isStart: boolean; code: string | null } {
  const m = START_RE.exec((text ?? "").trim());
  if (!m) return { isStart: false, code: null };
  if (m[1] && botUsername && m[1].toLowerCase() !== botUsername.toLowerCase()) return { isStart: false, code: null };
  return { isStart: true, code: m[2] ?? null };
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function nairaFromKobo(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

const PAYMENT_LABELS: Record<string, string> = {
  wallet: "Cash wallet",
  cash_wallet: "Cash wallet",
  tokens: "Tokens",
  subscription: "Meal plan",
  subscription_entitlement: "Meal plan",
  loan: "Eat Now & Pay Later",
  food_credit: "Eat Now & Pay Later",
  paystack: "Card / bank",
  gift: "Gift",
};

export type OrderAlertInput = {
  reference: string;
  outletName: string;
  items: { item_name: string; quantity: number }[];
  fulfillmentMethod: string;
  deliveryAddress: string | null;
  totalKobo: number;
  paymentMethod: string;
};

/** HTML message (Telegram parse_mode "HTML"); every dynamic value is escaped. */
export function orderAlertHtml(o: OrderAlertInput): string {
  const items = o.items.length
    ? o.items.map((i) => `🍲 ${i.quantity}x ${escapeHtml(i.item_name)}`).join("\n")
    : "🍲 Meal order";
  const destination = o.fulfillmentMethod === "delivery"
    ? `📍 <b>Delivery:</b> ${escapeHtml(o.deliveryAddress?.trim() || "address not provided")}`
    : `🏪 <b>Pickup</b> at ${escapeHtml(o.outletName)}`;
  const payment = PAYMENT_LABELS[o.paymentMethod] ?? escapeHtml(o.paymentMethod);
  return [
    `🔔 <b>New Order #${escapeHtml(o.reference)}!</b>`,
    items,
    destination,
    `💰 <b>Total:</b> ${nairaFromKobo(o.totalKobo)} · ${payment}`,
  ].join("\n");
}

export function telegramLinkUrls(botUsername: string, code: string) {
  return {
    personalUrl: `https://t.me/${botUsername}?start=${code}`,
    groupUrl: `https://t.me/${botUsername}?startgroup=${code}`,
  };
}
