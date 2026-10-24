import { createFileRoute } from "@tanstack/react-router";
import { applyVerifiedPayment, verifyWebhookSignature } from "@/lib/payments.server";

export const Route = createFileRoute("/api/public/paystack/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get("x-paystack-signature");

        const valid = await verifyWebhookSignature(raw, signature);
        if (!valid) {
          return new Response("Invalid signature", { status: 401 });
        }

        try {
          const event = JSON.parse(raw) as { event: string; data?: { reference?: string } };
          if (event.event === "charge.success" && event.data?.reference) {
            // Verify-then-apply: the reference is confirmed with Paystack again
            // before anything is credited, and application is idempotent.
            await applyVerifiedPayment(event.data.reference);
          }
          return new Response("OK", { status: 200 });
        } catch (error) {
          console.error("paystack webhook error", error);
          return new Response("OK", { status: 200 }); // never leak internals; Paystack retries otherwise
        }
      },
    },
  },
});
