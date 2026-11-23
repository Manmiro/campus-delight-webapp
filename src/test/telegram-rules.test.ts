import { describe, expect, it } from "vitest";
import { orderAlertHtml, parseStartCommand, telegramLinkUrls } from "@/lib/telegram-rules";

const CODE = "Abc123_-xyzXYZ7890";

describe("telegram link commands", () => {
  it("reads the code from a personal or group start command", () => {
    expect(parseStartCommand(`/start ${CODE}`)).toEqual({ isStart: true, code: CODE });
    expect(parseStartCommand(`/start@campus_delight_orders_bot ${CODE}`, "campus_delight_orders_bot")).toEqual({ isStart: true, code: CODE });
  });
  it("ignores start commands meant for another bot", () => {
    expect(parseStartCommand(`/start@other_bot ${CODE}`, "campus_delight_orders_bot").isStart).toBe(false);
  });
  it("treats a bare /start as a start without a code", () => {
    expect(parseStartCommand("/start")).toEqual({ isStart: true, code: null });
    expect(parseStartCommand("hello").isStart).toBe(false);
  });
  it("builds personal and kitchen-group links", () => {
    expect(telegramLinkUrls("bot", CODE)).toEqual({
      personalUrl: `https://t.me/bot?start=${CODE}`,
      groupUrl: `https://t.me/bot?startgroup=${CODE}`,
    });
  });
});

describe("telegram order alert", () => {
  it("shows reference, items, delivery address and total, escaping user text", () => {
    const html = orderAlertHtml({
      reference: "CD-1082", outletName: "Main", fulfillmentMethod: "delivery",
      deliveryAddress: "Hostel <B>, Room 14", totalKobo: 380000, paymentMethod: "wallet",
      items: [{ item_name: "Jollof & Chicken", quantity: 2 }],
    });
    expect(html).toContain("New Order #CD-1082!");
    expect(html).toContain("2x Jollof &amp; Chicken");
    expect(html).toContain("Hostel &lt;B&gt;, Room 14");
    expect(html).toContain("₦3,800");
  });
  it("shows pickup at the outlet when not delivered", () => {
    const html = orderAlertHtml({ reference: "R", outletName: "EBSU", fulfillmentMethod: "pickup", deliveryAddress: null, totalKobo: 0, paymentMethod: "tokens", items: [] });
    expect(html).toContain("<b>Pickup</b> at EBSU");
  });
});
