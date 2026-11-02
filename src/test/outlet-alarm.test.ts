import { describe, expect, it } from "vitest";
import { newlyConfirmedOrders, outletOrderAlarmMessage } from "@/lib/outlet-alarm";

describe("outlet order alarm", () => {
  it("greets the manager with the customer name and outlet ID", () => {
    expect(outletOrderAlarmMessage(" Ada Okafor ", "outlet-123")).toBe("Hello manager, there is a new order from Ada Okafor at outlet ID outlet-123.");
  });

  it("uses a safe fallback when the customer name is missing", () => {
    expect(outletOrderAlarmMessage(null, "outlet-123")).toContain("from a customer at outlet ID outlet-123");
  });

  it("detects new confirmed orders and pending-to-confirmed transitions", () => {
    const previous = new Map([
      ["already-confirmed", "confirmed"],
      ["card-order", "pending"],
    ]);
    const fresh = newlyConfirmedOrders(
      [
        { id: "already-confirmed", status: "confirmed" },
        { id: "card-order", status: "confirmed" },
        { id: "new-order", status: "confirmed" },
        { id: "still-pending", status: "pending" },
      ],
      previous,
    );

    expect(fresh.map((order) => order.id)).toEqual(["card-order", "new-order"]);
  });
});
