import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
import type React from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, CalendarDays, Coins, CreditCard, Minus, Plus, Search, ShieldCheck, ShoppingBag, Timer, Wallet } from "lucide-react";
import heroMeal from "@/assets/hero-meal.jpg";
import { profileQuery, myMenuQuery, subscriptionsQuery, todayEntitlementsQuery, walletQuery, tokenAccountQuery, creditQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { naira, planLabel, tierLabel } from "@/lib/format";
import { DEFAULT_CREDIT_LIMIT_KOBO, orderPaymentOptions, tokensForKobo } from "@/lib/prd-rules";
import { EmptyState } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/_customer/order")({
  component: OrderPage,
  head: () => ({ meta: [{ title: "Order Food — Campus Delight" }, { name: "description", content: "Order meals at your campus outlet and pay with your wallet or eligible benefits." }, { property: "og:title", content: "Order Food — Campus Delight" }, { property: "og:description", content: "Choose your campus meals and pay securely." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

type Cart = Record<string, number>;

const TERMS = [
  { days: 7, pct: 15 },
  { days: 14, pct: 25 },
  { days: 30, pct: 50 },
] as const;

function OrderPage() {
  const qc = useQueryClient();
  const [cart, setCart] = useState<Cart>({});
  const [method, setMethod] = useState("");
  const [termDays, setTermDays] = useState("7");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");

  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: menu } = useSuspenseQuery(myMenuQuery(profile.outlet_id ?? ""));
  const { data: subs } = useSuspenseQuery(subscriptionsQuery);
  const { data: ents } = useSuspenseQuery(todayEntitlementsQuery);
  const { data: wallet } = useSuspenseQuery(walletQuery);
  const { data: tk } = useSuspenseQuery(tokenAccountQuery);
  const { data: credit } = useSuspenseQuery(creditQuery);

  const activeSub = subs.find((s) => s.status === "active");
  const entToday = ents.filter((e) => e.subscription_id === activeSub?.id);
  const mealsAllowed = entToday.reduce((a, e) => a + e.allowance, 0);
  const mealsUsed = entToday.reduce((a, e) => a + e.redeemed, 0);
  const mealsLeft = mealsAllowed - mealsUsed;

  const cartItems = Object.entries(cart).filter(([, q]) => q > 0);
  const totalKobo = cartItems.reduce((sum, [id, qty]) => {
    const item = menu.find((m) => m.id === id);
    return sum + (item ? item.price_kobo * qty : 0);
  }, 0);

  const term = TERMS.find((t) => t.days === Number(termDays)) ?? TERMS[0];
  const creditCharge = Math.ceil((totalKobo * term.pct) / 100);
  const creditTotal = totalKobo + creditCharge;
  const availableCredit = (credit?.credit_limit_kobo ?? DEFAULT_CREDIT_LIMIT_KOBO) - (credit?.outstanding_kobo ?? 0);

  const placeOrder = useMutation({
    mutationFn: async () => {
      const items = cartItems.map(([menu_item_id, quantity]) => ({ menu_item_id, quantity }));
      const { error } = await supabase.rpc("place_order", {
        p_items: items,
        p_payment_method: method,
        ...(method === "subscription_entitlement" && activeSub ? { p_subscription_id: activeSub.id } : {}),
        ...(method === "food_credit" ? { p_loan_term_days: Number(termDays) } : {}),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Order placed!");
      setCart({});
      setMethod("");
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Order failed"),
  });

  if (!profile.outlet_id) {
    return <EmptyState title="No outlet assigned" hint="Your outlet assignment decides which menu you can order from." />;
  }
  if (menu.length === 0) {
    return <EmptyState title="Menu coming soon" hint="Your outlet hasn't published its menu yet. Check back shortly." />;
  }

  const payEnabled = orderPaymentOptions({
    mealsLeftToday: mealsLeft,
    walletBalanceKobo: wallet?.balance_kobo ?? 0,
    tokenBalance: tk?.available_tokens ?? 0,
    totalKobo,
    availableCreditKobo: availableCredit,
    isVerified: profile.verification_status === "verified",
    accountAgeHours: (Date.now() - new Date(profile.created_at).getTime()) / 3_600_000,
  });

  const methodOptions = [
    { value: "subscription_entitlement", label: `Subscription meal (${mealsLeft} left today)`, disabled: !payEnabled.subscription_entitlement },
    { value: "cash_wallet", label: `Cash wallet — ${naira(wallet?.balance_kobo)}`, disabled: !payEnabled.cash_wallet },
    { value: "tokens", label: `Tokens — ${tk?.available_tokens ?? 0}${totalKobo > 0 ? ` (needs ${tokensForKobo(totalKobo)})` : ""}`, disabled: !payEnabled.tokens },
    { value: "food_credit", label: "Eat Now & Pay Later", disabled: !payEnabled.food_credit },
  ];

  const categories = Array.from(new Set(menu.map((m) => m.category)));
  const q = search.trim().toLowerCase();
  const visible = menu.filter((m) => (cat === "all" || m.category === cat) && (!q || m.name.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q)));
  const itemCount = cartItems.reduce((a, [, n]) => a + n, 0);
  const methodIcon: Record<string, React.ReactNode> = {
    subscription_entitlement: <CalendarDays className="h-5 w-5" />,
    cash_wallet: <Wallet className="h-5 w-5" />,
    tokens: <Coins className="h-5 w-5" />,
    food_credit: <CreditCard className="h-5 w-5" />,
  };
  const add = (id: string, d: number) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        {/* Banner */}
        <section className="relative overflow-hidden rounded-3xl bg-foreground text-background shadow-soft">
          <img src={heroMeal} alt="Jollof rice with chicken and plantain" className="absolute inset-0 h-full w-full object-cover object-right opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground via-foreground/85 to-foreground/10" />
          <div className="relative max-w-md p-6 sm:p-8">
            <p className="text-sm opacity-80">{profile.outlet?.name ?? "Your outlet"}</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
              What are you<br /><span className="text-primary">craving today?</span>
            </h1>
            <div className="relative mt-5">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search jollof, beans, drinks…"
                className="h-12 rounded-full border-0 bg-card pl-11 text-foreground shadow-soft" />
            </div>
          </div>
        </section>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["all", ...categories].map((c) => (
            <button key={c} type="button" onClick={() => setCat(c)}
              className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold capitalize shadow-soft transition-all hover:-translate-y-0.5 ${cat === c ? "bg-primary text-primary-foreground shadow-glow" : "bg-card"}`}>
              <span className="text-lg">{emojiFor(c)}</span> {c === "all" ? "All" : c}
            </button>
          ))}
        </div>

        {/* Food grid */}
        {visible.length === 0 ? (
          <p className="rounded-3xl bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">Nothing matches “{search}”. Try another dish.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {visible.map((item) => {
              const qty = cart[item.id] ?? 0;
              return (
                <div key={item.id} className={`group flex min-w-0 flex-col rounded-3xl border bg-card p-3 shadow-soft transition-all hover:-translate-y-1 hover:shadow-glow sm:p-4 ${qty > 0 ? "border-primary ring-2 ring-primary/30" : "border-border/60"} ${item.is_available ? "" : "opacity-50"}`}>
                  <div className="relative grid aspect-[4/3] place-items-center rounded-2xl bg-canvas text-5xl transition-transform group-hover:scale-[1.03] sm:text-6xl">
                    <span className="transition-transform group-hover:rotate-6 group-hover:scale-110">{emojiFor(item.category, item.name)}</span>
                    {item.is_credit_eligible && (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-golden px-2 py-0.5 text-[10px] font-semibold text-golden-foreground">
                        <Timer className="h-3 w-3" /> Pay later
                      </span>
                    )}
                    {!item.is_available && <span className="absolute right-2 top-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">Sold out</span>}
                  </div>
                  <p className="mt-3 break-words font-display font-bold leading-tight">{item.name}</p>
                  <p className="line-clamp-2 break-words text-xs text-muted-foreground">{item.description}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <p className="font-display text-base font-extrabold text-primary sm:text-lg">{naira(item.price_kobo)}</p>
                    {qty === 0 ? (
                      <Button size="icon" className="h-9 w-9 rounded-full" disabled={!item.is_available} onClick={() => add(item.id, 1)} aria-label={`Add ${item.name}`}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1 rounded-full bg-canvas p-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => add(item.id, -1)} aria-label={`Remove ${item.name}`}><Minus className="h-3 w-3" /></Button>
                        <span className="w-5 animate-pop-in text-center text-sm font-bold">{qty}</span>
                        <Button size="icon" className="h-7 w-7 rounded-full" disabled={!item.is_available} onClick={() => add(item.id, 1)} aria-label={`Add ${item.name}`}><Plus className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Order summary */}
      <aside id="cart" className="h-fit min-w-0 rounded-3xl border border-border/60 bg-card p-5 shadow-soft xl:sticky xl:top-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><ShoppingBag className="h-5 w-5 text-primary" /> Your order</h2>
          {itemCount > 0 && <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">{itemCount} item{itemCount === 1 ? "" : "s"}</span>}
        </div>

        {cartItems.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-canvas p-6 text-center">
            <p className="text-4xl">🍽️</p>
            <p className="mt-2 text-sm text-muted-foreground">Tap + to add items from the menu.</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {cartItems.map(([id, qty]) => {
              const item = menu.find((m) => m.id === id);
              if (!item) return null;
              return (
                <li key={id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-canvas p-2.5 text-sm">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-card text-xl">{emojiFor(item.category, item.name)}</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">×{qty} · {naira(item.price_kobo)}</p>
                  </div>
                  <span className="font-semibold">{naira(item.price_kobo * qty)}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-gradient-brand px-4 py-3 text-primary-foreground">
          <span className="text-sm font-semibold">Total</span>
          <span className="font-display text-2xl font-extrabold">{naira(totalKobo)}</span>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold">Pay with (one method only)</p>
          <div role="radiogroup" className="mt-2 grid grid-cols-2 gap-2">
            {methodOptions.map((o) => (
              <button key={o.value} type="button" role="radio" aria-checked={method === o.value} disabled={o.disabled}
                onClick={() => setMethod(o.value)}
                className={`flex min-w-0 flex-col items-start gap-1.5 rounded-2xl border p-3 text-left text-xs transition-all disabled:cursor-not-allowed disabled:opacity-40 ${method === o.value ? "border-primary bg-primary/10 ring-2 ring-primary/40" : "border-border/60 bg-canvas hover:border-primary/50"}`}>
                <span className={method === o.value ? "text-primary" : "text-muted-foreground"}>{methodIcon[o.value]}</span>
                <span className="break-words font-semibold leading-snug">{o.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Cash and tokens can never be combined on one purchase.</p>
        </div>

        {method === "food_credit" && (
          <div className="mt-4 rounded-2xl bg-accent p-3 text-sm">
            <p className="text-xs font-semibold">Repayment term</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {TERMS.map((t) => (
                <button key={t.days} type="button" onClick={() => setTermDays(String(t.days))}
                  className={`rounded-xl px-2 py-2 text-center text-xs font-semibold transition-all ${termDays === String(t.days) ? "bg-primary text-primary-foreground shadow-glow" : "bg-card"}`}>
                  {t.days} days<span className="block font-normal opacity-80">+{t.pct}%</span>
                </button>
              ))}
            </div>
            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between"><dt>Food now</dt><dd>{naira(totalKobo)}</dd></div>
              <div className="flex justify-between"><dt>Charge ({term.pct}%)</dt><dd>{naira(creditCharge)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Total repayable</dt><dd>{naira(creditTotal)}</dd></div>
              <p className="pt-1 text-[11px] text-muted-foreground">
                Due in {term.days} days. Part-payments welcome; settle fully on time and your limit doubles.
              </p>
            </dl>
          </div>
        )}

        {method === "subscription_entitlement" && activeSub && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-secondary/60 p-3 text-sm text-secondary-foreground">
            <ShieldCheck className="h-4 w-4" />
            {planLabel(activeSub.plan)} · {tierLabel(activeSub.tier)} — {mealsLeft} meal{mealsLeft === 1 ? "" : "s"} left today
          </div>
        )}

        <Button size="lg" className="mt-5 w-full rounded-full" disabled={cartItems.length === 0 || !method || !methodOptions.some(o => o.value === method && !o.disabled) || placeOrder.isPending} onClick={() => placeOrder.mutate()}>
          {placeOrder.isPending && <LoaderPlaceholder />} Confirm order <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </aside>

      {/* Mobile floating cart */}
      {itemCount > 0 && (
        <a href="#cart" className="fixed inset-x-4 bottom-4 z-40 flex items-center justify-between rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-glow xl:hidden">
          <span className="flex items-center gap-2 font-semibold"><ShoppingBag className="h-4 w-4" /> {itemCount} item{itemCount === 1 ? "" : "s"}</span>
          <span className="font-display font-extrabold">{naira(totalKobo)} →</span>
        </a>
      )}
    </div>
  );
}

function emojiFor(category: string, name = ""): string {
  const s = `${name} ${category}`.toLowerCase();
  if (category === "all" && !name) return "🍽️";
  if (s.includes("rice")) return "🍛";
  if (s.includes("bean")) return "🫘";
  if (s.includes("chicken")) return "🍗";
  if (s.includes("water")) return "💧";
  if (s.includes("drink") || s.includes("juice") || s.includes("bever")) return "🥤";
  if (s.includes("bread") || s.includes("snack")) return "🥖";
  if (s.includes("swallow") || s.includes("soup") || s.includes("egusi")) return "🍲";
  if (s.includes("spaghetti") || s.includes("pasta")) return "🍝";
  if (s.includes("plantain") || s.includes("dodo")) return "🍌";
  if (s.includes("meat") || s.includes("beef")) return "🥩";
  if (s.includes("fish")) return "🐟";
  if (s.includes("egg")) return "🍳";
  if (s.includes("side")) return "🥗";
  return "🍲";
}

function LoaderPlaceholder() {
  return <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}
