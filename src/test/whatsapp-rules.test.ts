import { describe, expect, it } from "vitest";
import { orderAlertMessage, termiiPhone } from "@/lib/whatsapp-rules";

describe("whatsapp rules", () => {
  it("normalizes Nigerian numbers for Termii", () => {
    expect(termiiPhone("08031234567")).toBe("2348031234567");
    expect(termiiPhone("+234 803 123 4567")).toBe("2348031234567");
    expect(termiiPhone("12345")).toBeNull();
  });
  it("formats the order alert", () => {
    const m = orderAlertMessage({ reference: "CD-1082", items: "1x Fried Rice", destination: "Delivery: Hostel B", totalKobo: 250000, url: "u" });
    expect(m).toContain("#CD-1082");
    expect(m).toContain("₦2,500");
  });
});
