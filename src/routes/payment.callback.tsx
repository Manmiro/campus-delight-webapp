import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyPayment } from "@/lib/payments.functions";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/payment/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    reference: (search["reference"] as string | undefined) ?? (search["trxref"] as string | undefined) ?? undefined,
  }),
  head: () => ({
    meta: [
      { title: "Payment status — Campus Delight" },
      { name: "description", content: "Your Campus Delight payment status." },
      { property: "og:title", content: "Payment status — Campus Delight" },
      { property: "og:description", content: "Your Campus Delight payment status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentCallback,
});

function PaymentCallback() {
  const { reference } = Route.useSearch();
  const verify = useServerFn(verifyPayment);
  const qc = useQueryClient();
  const [state, setState] = useState<"verifying" | "success" | "failed">("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!reference) {
      setState("failed");
      setMessage("No payment reference found.");
      return;
    }
    void (async () => {
      try {
        const result = await verify({ data: { reference } });
        if (result.status === "success" && result.applied) {
          void qc.invalidateQueries({ queryKey: ["me"] });
          setState("success");
          setMessage(
            result.purpose === "subscription"
              ? "Your subscription is now active."
              : result.purpose === "order_payment"
              ? "Your card payment is confirmed and your food order has been placed."
              : "Your wallet has been funded.",
          );
        } else {
          setState("failed");
          setMessage("The payment could not be verified. If you were debited, contact support with the reference.");
        }
      } catch {
        setState("failed");
        setMessage("We could not confirm this payment right now. Please try again shortly.");
      }
    })();
  }, [reference, verify, qc]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        {state === "verifying" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-2xl font-bold">Confirming your payment…</h1>
            <p className="mt-2 text-sm text-muted-foreground">We are verifying with the payment gateway. Never trust the redirect alone — hang tight.</p>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 font-display text-2xl font-bold">Payment successful</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <Button asChild className="mt-6">
              <Link to="/dashboard">Go to my dashboard</Link>
            </Button>
          </>
        )}
        {state === "failed" && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-4 font-display text-2xl font-bold">Payment not completed</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
            <Button variant="outline" asChild className="mt-6">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          </>
        )}
        {reference && <p className="mt-4 font-mono text-xs text-muted-foreground">Ref: {reference}</p>}
      </div>
    </div>
  );
}
