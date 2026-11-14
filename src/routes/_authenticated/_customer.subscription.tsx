import { useState } from "react";
import { createFileRoute, Link } from '@tanstack/react-router'
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatFoodieError, showFoodieError } from "@/lib/foodie-errors";
import { ArrowRight, CalendarDays, Check, Loader2, ReceiptText, Sparkles, Trash2, UtensilsCrossed, Wallet, Zap } from "lucide-react";
import heroMeal from "@/assets/hero-meal.webp.asset.json";
import { initializePayment } from "@/lib/payments.functions";
import { paySubscriptionFromWallet, removePendingSubscription } from "@/lib/subscriptions.functions";
import { profileQuery, subscriptionsQuery, myPlanPricesQuery, walletQuery } from "@/lib/queries";
import { getUserId } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { naira, planLabel, tierLabel, formatDate } from "@/lib/format";
import { StatusBadge, EmptyState } from "@/components/bits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/_customer/subscription")({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData({ ...subscriptionsQuery, revalidateIfStale: true }),
      queryClient.ensureQueryData({ ...walletQuery, revalidateIfStale: true }),
      queryClient.ensureQueryData({ ...profileQuery, revalidateIfStale: true }).then(async (profile) => {
        await queryClient.ensureQueryData(myPlanPricesQuery(profile.outlet_id ?? ""));
      }),
    ]);
  },
  errorComponent: ({ error }) => { const copy = formatFoodieError(error, { fallback: "This page could not load. Please try again." }); return <div role="alert" className="p-6 text-destructive"><p className="font-semibold">{copy.title}</p><p className="mt-1">{copy.description}</p></div>; },
  notFoundComponent: () => <div className="p-6">Food plans page not found.</div>,
  component: SubscriptionPage,
  head: () => ({ meta: [{ title: "My Food Plans — Campus Delight" }, { name: "description", content: "Choose a campus meal subscription and pay securely with Paystack or your Campus Delight wallet." }, { property: "og:title", content: "My Food Plans — Campus Delight" }, { property: "og:description", content: "Weekend, weekly and monthly meal plans at your outlet." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
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
  const payWallet = useServerFn(paySubscriptionFromWallet);
  const removePlan = useServerFn(removePendingSubscription);
  const [selected, setSelected] = useState<(typeof plans)[number]["plan"]>("weekly");
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: subs } = useSuspenseQuery(subscriptionsQuery);
  const { data: prices } = useSuspenseQuery(myPlanPricesQuery(profile.outlet_id ?? ""));
  const { data: wallet, isError: walletError } = useSuspenseQuery({ ...walletQuery, refetchInterval: 15_000 });
  const balance = wallet.balance_kobo;

  const priceOf = (plan: string, tier: string) =>
    prices.find((p) => p.plan === plan && p.tier === tier && p.is_active)?.price_kobo ?? null;

  const buy = useMutation({
    mutationFn: async ({ plan, tier, subscriptionId, method }: { plan: string; tier: string; subscriptionId?: string; method: "online" | "wallet" }) => {
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
      if (method === "wallet") return payWallet({ data: { subscriptionId: relatedId, priceKobo } });
      const result = await initPayment({ data: { purpose: "subscription", relatedId, origin: window.location.origin } });
      window.location.href = result.authorizationUrl;
      return undefined;
    },
    onSuccess: (_, variables) => {
      if (variables.method === "wallet") toast.success("Your meal plan is active. Payment made from your wallet.");
    },
    onError: (e) => showFoodieError(e, "Could not start checkout"),
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["plan-prices", profile.outlet_id] }),
      ]);
    },
  });

  const remove = useMutation({
    mutationFn: (subscriptionId: string) => removePlan({ data: { subscriptionId } }),
    onSuccess: () => toast.success("Unpaid plan removed"),
    onError: (e) => showFoodieError(e, "Could not remove plan"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["me", "subscriptions"] }),
  });
  const busy = buy.isPending || remove.isPending;
  const visibleSubs = subs.filter(s => s.status !== "cancelled");

  function paymentActions(plan: string, tier: string, subscriptionId?: string) {
    const price = priceOf(plan, tier);
    const insufficient = price != null && balance < price;
    const unavailable = price == null || price <= 0;
    const args = { plan, tier, ...(subscriptionId ? { subscriptionId } : {}) };
    const paying = buy.isPending && buy.variables.plan === plan && buy.variables.tier === tier && buy.variables.subscriptionId === subscriptionId;
    return <div className="mt-4 space-y-2">
      <div className="flex flex-col gap-2">
        <Button variant={tier === "standard" && !subscriptionId ? "secondary" : "default"} className="rounded-full" disabled={unavailable || busy} onClick={() => buy.mutate({ ...args, method: "online" })}>
          {paying && buy.variables.method === "online" && <Loader2 className="h-4 w-4 animate-spin" />} Pay now
        </Button>
        <Button variant="secondary" className="h-auto min-h-10 whitespace-normal rounded-2xl py-2 text-center" disabled={unavailable || insufficient || walletError || busy} onClick={() => buy.mutate({ ...args, method: "wallet" })}>
          {paying && buy.variables.method === "wallet" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Wallet className="h-4 w-4 shrink-0" />}
          <span>Pay from wallet · {walletError ? "Balance unavailable" : `${naira(balance)} available`}</span>
        </Button>
      </div>
      {insufficient && <p className="text-xs">Needs {naira(price)} ({naira(price - balance)} more) — <Link to="/wallet" className="font-semibold underline underline-offset-2">Top up wallet</Link></p>}
      {walletError && <p className="text-xs" role="alert">Could not refresh your wallet balance. Please try again.</p>}
      {unavailable && <p className="text-xs">This plan is currently unavailable.</p>}
    </div>;
  }

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
        <img src={heroMeal.url} decoding="async" alt="Plate of jollof rice with chicken and plantain" className="absolute inset-0 h-full w-full object-cover object-right opacity-90" />
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
            <p className="mt-1 text-xs text-muted-foreground">Pay online with Paystack (card, bank transfer or USSD), or instantly from your wallet.</p>
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
                  {Array.from({ length: tierCount[t] ?? 1 }).map((_, k) => <span key={k}>🍛</span>)}
                </div>
                <p className={`text-sm ${popular ? "opacity-90" : "text-muted-foreground"}`}>{tierMeals[t]}</p>
                <p className="mt-4 font-display text-3xl font-extrabold">{price == null ? "—" : naira(price)}</p>
                <p className={`text-xs ${popular ? "opacity-80" : "text-muted-foreground"}`}>{price == null ? "Not offered at your outlet yet" : `per ${current.name.toLowerCase()} plan`}</p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {[tierMeals[t], current.desc, "Pay with Paystack or your wallet"].map((f) => (
                    <li key={f} className="flex items-start gap-2"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${popular ? "" : "text-primary"}`} /> {f}</li>
                  ))}
                </ul>
                {paymentActions(current.plan, t)}
              </div>
            );
          })}
        </div>
      </section>

      {/* Subscriptions */}
      <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:p-8">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold"><ReceiptText className="h-5 w-5 text-golden" /> Your subscriptions</h2>
        {visibleSubs.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-canvas p-4 text-sm text-muted-foreground">No subscriptions yet — pick a plan above. Weekend covers Fridays to Sundays only.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {visibleSubs.map((s) => (
              <div key={s.id} className={`grid gap-3 rounded-2xl p-4 sm:grid-cols-[auto_minmax(0,1fr)] ${s.status === "active" ? "bg-primary/10 ring-1 ring-primary/40" : "bg-canvas"}`}>
                <span className="hidden h-11 w-11 place-items-center rounded-2xl bg-card text-primary shadow-soft sm:grid"><CalendarDays className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{planLabel(s.plan)} · {tierLabel(s.tier)}</p>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {s.start_date ? `${formatDate(s.start_date)} → ${formatDate(s.end_date)}` : "Awaiting payment"} · {naira(["awaiting_payment", "renewal_pending"].includes(s.status) ? priceOf(s.plan, s.tier) ?? s.price_kobo : s.price_kobo)}
                  </p>
                  {(s.status === "awaiting_payment" || s.status === "renewal_pending") && paymentActions(s.plan, s.tier, s.id)}
                  {s.status === "awaiting_payment" && <Button variant="ghost" size="icon" className="mt-2 text-destructive" aria-label={`Remove unpaid ${planLabel(s.plan)} ${tierLabel(s.tier)} plan`} title="Remove unpaid plan" disabled={busy} onClick={() => remove.mutate(s.id)}>
                    {remove.isPending && remove.variables === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
