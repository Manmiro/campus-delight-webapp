/** Termii expects international digits without "+", e.g. 2348012345678. */
export function termiiPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (/^234[789][01]\d{8}$/.test(digits)) return digits;
  if (/^0[789][01]\d{8}$/.test(digits)) return `234${digits.slice(1)}`;
  return null;
}

export function orderAlertMessage(o: { reference: string; items: string; destination: string; totalKobo: number | null; url: string }) {
  const total = o.totalKobo != null ? `\n💰 Total: ₦${(o.totalKobo / 100).toLocaleString("en-NG")}` : "";
  return `🔔 New Order #${o.reference}!\n🍲 ${o.items}\n📍 ${o.destination}${total}\n\nTap to view and fulfill: ${o.url}`;
}
