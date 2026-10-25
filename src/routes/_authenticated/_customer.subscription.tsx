import { useState } from "react";
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, CalendarDays, Check, Loader2, ReceiptText, Sparkles, UtensilsCrossed, Zap } from "lucide-react";
import heroMeal from "@/assets/hero-meal.jpg";
import { initializePayment } from "@/lib/payments.functions";
import { profileQuery, subscriptionsQuery, myPlanPricesQuery } from "@/lib/queries";
import { getUserId } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { naira, planLabel, tierLabel, formatDate } from "@/lib/format";
import { StatusBadge, EmptyState } from "@/components/bits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_customer/subscription")({
  component: SubscriptionPage,
  head: () => ({ meta: [{ title: "My Subscription — Campus Delight" }, { name: "description", content: "Choose a campus meal subscription and pay securely with Paystack." }, { property: "og:title", content: "My Subscription — Campus Delight" }, { property: "og:description", content: "Weekend, weekly and monthly meal plans at your outlet." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

const plans = [
  { plan: "weekend", name: "Weekend", desc: "Fridays, Saturdays & Sundays only" },
  { plan: "weekly", name: "Weekly", desc: "Seven days of service" },
  { plan: "monthly", name: "Monthly", desc: "A full calendar month" },
] as const;
const tiers = ["basic", "standard", "turbo"] as const;
const tierMeals: Record<string, string> = { basic: "1 meal/day", standard: "2 meals/day", turbo: "3 meals/day" };
const tierCount: Record<string, number> = { basic: 1, standard: 2, turbo: 3 };

function SubscriptionPage() {
  const qc = useQueryClient();
  const initPayment = useServerFn(initializePayment);
  const [selected, setSelected] = useState<(typeof plans)[number]["plan"]>("weekly");
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: subs } = useSuspenseQuery(subscriptionsQuery);
  const { data: prices } = useSuspenseQuery(myPlanPricesQuery(profile.outlet_id ?? ""));

  const priceOf = (plan: string, tier: string) =>
    prices.find((p) => p.plan === plan && p.tier === tier && p.is_active)?.price_kobo ?? null;

  const buy = useMutation({
    mutationFn: async ({ plan, tier, subscriptionId }: { plan: string; tier: string; subscriptionId?: string }) => {
      const priceKobo = priceOf(plan, tier);
      if (priceKobo == null) throw new Error("This plan is not available at your outlet yet");
      const customerId = await getUserId();
      if (!profile.outlet_id) throw new Error("No outlet assigned to your account");
      let relatedId = subscriptionId;
      if (!relatedId) {
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
      relatedId = sub.id;
      }
      const result = await initPayment({ data: { purpose: "subscription", relatedId, origin: window.location.origin } });
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

  const active = subs.find((s) => s.status === "active");
  const current = plans.find((p) => p.plan === selected) ?? plans[1];
  const daysLeft = active?.end_date ? Math.max(0, Math.ceil((new Date(active.end_date).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-foreground text-background shadow-soft">
        <img src={heroMeal} alt="Plate of jollof rice with chicken and plantain" className="absolute inset-0 h-full w-full object-cover object-right opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground via-foreground/85 to-foreground/20" />
        <div className="relative grid gap-5 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0 max-w-lg">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-golden px-3 py-1 text-xs font-semibold text-golden-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Meal plans · {profile.outlet?.name ?? "your outlet"}
            </span>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
              {active ? "Your meals are sorted." : <>Never worry about<br /><span className="text-primary">your next meal.</span></>}
            </h1>
            <p className="mt-2 text-sm opacity-85">Pick a plan, choose how many meals a day, and eat at your outlet without paying each time.</p>
          </div>
          {active ? (
            <div className="rounded-3xl bg-gradient-brand p-5 text-primary-foreground shadow-glow">
              <p className="text-xs opacity-85">Active plan</p>
              <p className="font-display text-xl font-bold">{planLabel(active.plan)} · {tierLabel(active.tier)}</p>
              <p className="mt-2 font-display text-4xl font-extrabold">{daysLeft}<span className="ml-1 text-base font-semibold opacity-85">days left</span></p>
              <p className="text-xs opacity-85">Ends {formatDate(active.end_date)}</p>
            </div>
          ) : (
            <Button size="lg" className="rounded-full shadow-glow" onClick={() => document.getElementById("plans")?.scrollIntoView({ behavior: "smooth" })}>
              See plans <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </section>

      {/* Plan picker */}
      <section id="plans" className="scroll-mt-24 rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold">Plans at your outlet</h2>
            <p className="text-sm text-muted-foreground">Prices are set by your outlet. Weekends never include Monday–Thursday.</p>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-full bg-canvas p-1">
            {plans.map((p) => (
              <button key={p.plan} type="button" onClick={() => setSelected(p.plan)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${selected === p.plan ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground"}`}>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-canvas px-4 py-2.5 text-sm">
          <CalendarDays className="h-4 w-4 text-primary" /> <span className="font-semibold">{current.name}:</span> {current.desc}
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {tiers.map((t, i) => {
            const price = priceOf(current.plan, t);
            const popular = t === "standard";
            return (
              <div key={`${current.plan}-${t}`}
                className={`relative flex animate-pop-in flex-col rounded-3xl p-5 transition-all hover:-translate-y-1 ${popular ? "bg-gradient-brand text-primary-foreground shadow-glow" : "bg-canvas hover:shadow-soft"}`}
                style={{ animationDelay: `${i * 80}ms` }}>
                {popular && (
                  <span className="absolute -top-3 right-5 rounded-full bg-golden px-3 py-1 text-xs font-bold text-golden-foreground shadow-soft">⭐ Most popular</span>
                )}
                <div className="flex items-center justify-between">
                  <p className="font-display text-lg font-bold">{tierLabel(t)}</p>
                  <span className={`grid h-10 w-10 place-items-center rounded-2xl ${popular ? "bg-primary-foreground/15" : "bg-card text-primary"}`}>
                    {t === "turbo" ? <Zap className="h-5 w-5" /> : <UtensilsCrossed className="h-5 w-5" />}
                  </span>
                </div>
                <div className="mt-3 flex gap-1.5 text-2xl" aria-label={tierMeals[t]}>
                  {Array.from({ length: tierCount[t] }).map((_, k) => <span key={k}>🍛</span>)}
                </div>
                <p className={`text-sm ${popular ? "opacity-90" : "text-muted-foreground"}`}>{tierMeals[t]}</p>
                <p className="mt-4 font-display text-3xl font-extrabold">{price == null ? "—" : naira(price)}</p>
                <p className={`text-xs ${popular ? "opacity-80" : "text-muted-foreground"}`}>{price == null ? "Not offered at your outlet yet" : `per ${current.name.toLowerCase()} plan`}</p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {[tierMeals[t], current.desc, "Pay securely with Paystack"].map((f) => (
                    <li key={f} className="flex items-start gap-2"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${popular ? "" : "text-primary"}`} /> {f}</li>
                  ))}
                </ul>
                <Button
                  className="mt-5 rounded-full"
                  variant={popular ? "secondary" : "default"}
                  disabled={price == null || buy.isPending}
                  onClick={() => buy.mutate({ plan: current.plan, tier: t })}
                >
                  {buy.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Subscribe
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Subscriptions */}
      <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:p-8">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold"><ReceiptText className="h-5 w-5 text-golden" /> Your subscriptions</h2>
        {subs.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-canvas p-4 text-sm text-muted-foreground">No subscriptions yet — pick a plan above. Weekend covers Fridays to Sundays only.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {subs.map((s) => (
              <div key={s.id} className={`grid gap-3 rounded-2xl p-4 sm:grid-cols-[auto_minmax(0,1fr)] ${s.status === "active" ? "bg-primary/10 ring-1 ring-primary/40" : "bg-canvas"}`}>
                <span className="hidden h-11 w-11 place-items-center rounded-2xl bg-card text-primary shadow-soft sm:grid"><CalendarDays className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{planLabel(s.plan)} · {tierLabel(s.tier)}</p>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {s.start_date ? `${formatDate(s.start_date)} → ${formatDate(s.end_date)}` : "Awaiting payment"} · {naira(s.price_kobo)}
                  </p>
                  {s.status === "awaiting_payment" && (
                    <Button size="sm" className="mt-2 rounded-full" onClick={() => buy.mutate({ plan: s.plan, tier: s.tier, subscriptionId: s.id })} disabled={buy.isPending}>
                      {buy.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />} Pay now
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
