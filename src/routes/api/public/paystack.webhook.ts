import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/paystack/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { applyVerifiedPayment, verifyWebhookSignature } = await import("@/lib/payments.server");
        const raw = await request.text();
        const signature = request.headers.get("x-paystack-signature");

        const valid = await verifyWebhookSignature(raw, signature);
        if (!valid) {
          return new Response("Invalid signature", { status: 401 });
        }

        try {
          const event = z.object({ event: z.string(), data: z.object({ reference: z.string().min(1).max(100) }).optional() }).parse(JSON.parse(raw));
          if (event.event === "charge.success" && event.data?.reference) {
            // Verify-then-apply: the reference is confirmed with Paystack again
            // before anything is credited, and application is idempotent.
            await applyVerifiedPayment(event.data.reference);
          }
          return new Response("OK", { status: 200 });
        } catch (error) {
          console.error("paystack webhook error", error);
          return new Response("Payment processing failed", { status: 500 }); // non-2xx allows Paystack to retry
        }
      },
    },
  },
});
