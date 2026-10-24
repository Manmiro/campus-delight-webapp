import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { initializePayment } from "@/lib/payments.functions";
import { profileQuery, subscriptionsQuery, myPlanPricesQuery } from "@/lib/queries";
import { getUserId } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { naira, planLabel, tierLabel, formatDate, formatDateTime } from "@/lib/format";
import { StatusBadge, EmptyState, PageLoader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_customer/subscription")({
  component: SubscriptionPage,
  head: () => ({ meta: [{ title: "My Subscription — Campus Delight" }] }),
});

const plans = [
  { plan: "weekend", name: "Weekend", desc: "Fridays, Saturdays & Sundays only" },
  { plan: "weekly", name: "Weekly", desc: "Seven days of service" },
  { plan: "monthly", name: "Monthly", desc: "A full calendar month" },
] as const;
const tiers = ["basic", "standard", "turbo"] as const;
const tierMeals: Record<string, string> = { basic: "1 meal/day", standard: "2 meals/day", turbo: "3 meals/day" };

function SubscriptionPage() {
  const qc = useQueryClient();
  const initPayment = useServerFn(initializePayment);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: subs } = useSuspenseQuery(subscriptionsQuery);
  const { data: prices } = useSuspenseQuery(myPlanPricesQuery(profile.outlet_id ?? ""));

  const priceOf = (plan: string, tier: string) =>
    prices.find((p) => p.plan === plan && p.tier === tier && p.is_active)?.price_kobo ?? null;

  const buy = useMutation({
    mutationFn: async ({ plan, tier }: { plan: string; tier: string }) => {
      const priceKobo = priceOf(plan, tier);
      if (priceKobo == null) throw new Error("This plan is not available at your outlet yet");
      const customerId = await getUserId();
      if (!profile.outlet_id) throw new Error("No outlet assigned to your account");
      const { data: sub, error } = await supabase
        .from("subscriptions")
        .insert({
          customer_id: customerId,
          outlet_id: profile.outlet_id,
          plan,
          tier,
          price_kobo: priceKobo,
          status: "awaiting_payment",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const result = await initPayment({ data: { purpose: "subscription", amountKobo: priceKobo, relatedId: sub.id } });
      window.location.href = result.authorizationUrl;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["me", "subscriptions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start checkout"),
  });

  if (!profile.outlet_id) {
    return <EmptyState title="No outlet assigned" hint="Contact support to assign your outlet before subscribing." />;
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-lg font-semibold">Your subscriptions</h2>
        {subs.length === 0 ? (
          <EmptyState title="No subscriptions yet" hint="Pick a plan below — Weekend covers Fridays to Sundays only." />
        ) : (
          <div className="mt-3 space-y-3">
            {subs.map((s) => (
              <Card key={s.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold">{planLabel(s.plan)} · {tierLabel(s.tier)}</p>
                    <p className="text-sm text-muted-foreground">
                      {s.start_date ? `${formatDate(s.start_date)} → ${formatDate(s.end_date)}` : "Awaiting payment"} · {naira(s.price_kobo)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={s.status} />
                    {s.status === "awaiting_payment" && (
                      <Button size="sm" onClick={() => buy.mutate({ plan: s.plan, tier: s.tier })} disabled={buy.isPending}>
                        {buy.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />} Pay now
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">Plans at your outlet</h2>
        <p className="text-sm text-muted-foreground">Prices are set by your outlet. Weekends never include Monday–Thursday.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.plan}>
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">{p.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{p.desc}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {tiers.map((t) => {
                  const price = priceOf(p.plan, t);
                  return (
                    <div key={t} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold">{tierLabel(t)}</p>
                        <p className="text-xs text-muted-foreground">{tierMeals[t]}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{price == null ? "—" : naira(price)}</p>
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          disabled={price == null || buy.isPending}
                          onClick={() => buy.mutate({ plan: p.plan, tier: t })}
                        >
                          Subscribe
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

export { Table, TableHead, TableHeader, TableRow, TableCell, TableBody };
