import { describe, expect, it } from "vitest";
import { outletOrderAlarmMessage } from "@/lib/outlet-alarm";

describe("outlet order alarm", () => {
  it("greets the manager with the customer name and outlet ID", () => {
    expect(outletOrderAlarmMessage(" Ada Okafor ", "outlet-123")).toBe("Hello manager, there is a new order from Ada Okafor at outlet ID outlet-123.");
  });

  it("uses a safe fallback when the customer name is missing", () => {
    expect(outletOrderAlarmMessage(null, "outlet-123")).toContain("from a customer at outlet ID outlet-123");
  });
});
