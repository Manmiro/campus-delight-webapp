export function outletOrderAlarmMessage(customerName: string | null | undefined, outletId: string): string {
  return `Hello manager, there is a new order from ${customerName?.trim() || "a customer"} at outlet ID ${outletId}.`;
}
