import { z } from "zod";

export const paymentInput = z.object({
  purpose: z.enum(["wallet_funding", "subscription", "order_payment"]),
  amountKobo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  relatedId: z.string().uuid().optional(),
  origin: z.string().url(),
  items: z.array(z.object({ menu_item_id: z.string().uuid(), quantity: z.number().int().min(1).max(100) })).min(1).max(100).optional(),
}).superRefine((input, ctx) => {
  if (input.purpose === "wallet_funding" && !input.amountKobo) ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
  if (input.purpose === "subscription" && !input.relatedId) ctx.addIssue({ code: "custom", message: "Subscription required" });
  if (input.purpose === "order_payment" && !input.items) ctx.addIssue({ code: "custom", message: "Order items required" });
});

export type PaymentInput = z.infer<typeof paymentInput>;

export function verifiedPaymentMatches(expected: { reference: string; amountKobo: number }, actual: { reference: string; amount: number; currency: string; status: string }) {
  return actual.status === "success" && actual.reference === expected.reference && actual.currency === "NGN" && actual.amount === expected.amountKobo;
}