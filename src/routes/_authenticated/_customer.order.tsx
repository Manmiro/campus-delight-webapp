import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from "react";
import type React from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, CalendarDays, Coins, CreditCard, Minus, Plus, Search, ShieldCheck, ShoppingBasket, Timer, Wallet } from "lucide-react";
import heroMeal from "@/assets/hero-meal.jpg";
import { profileQuery, myMenuQuery, subscriptionsQuery, todayEntitlementsQuery, walletQuery, tokenAccountQuery, creditQuery } from "@/lib/queries";
import { useServerFn } from "@tanstack/react-start";
import { placeFoodOrder } from "@/lib/transactions.functions";
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
  const submitOrder = useServerFn(placeFoodOrder);
  const [cart, setCart] = useState<Cart>({});
  const [method, setMethod] = useState("");
  const [termDays, setTermDays] = useState("7");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");
  const [cartVisible, setCartVisible] = useState(false);
  const basketAnimations = useRef(new Set<Animation>());

  useEffect(() => () => {
    basketAnimations.current.forEach((animation) => animation.cancel());
    basketAnimations.current.clear();
  }, []);

  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: menu } = useSuspenseQuery(myMenuQuery(profile.outlet_id ?? ""));
  const { data: subs } = useSuspenseQuery(subscriptionsQuery);
  const { data: ents } = useSuspenseQuery(todayEntitlementsQuery);
  const { data: wallet } = useSuspenseQuery(walletQuery);
  const { data: tk } = useSuspenseQuery(tokenAccountQuery);
  const { data: credit } = useSuspenseQuery(creditQuery);

  useEffect(() => {
    const summary = document.getElementById("cart");
    if (!summary) return;
    const observer = new IntersectionObserver(([entry]) => {
      setCartVisible(entry?.isIntersecting ?? false);
    });
    observer.observe(summary);
    return () => observer.disconnect();
  }, [profile.outlet_id, menu.length]);

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
      await submitOrder({ data: {
        items,
        method,
        ...(method === "subscription_entitlement" && activeSub ? { subscriptionId: activeSub.id } : {}),
        ...(method === "food_credit" ? { termDays: Number(termDays) } : {}),
      } });
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

  // "meals" is a retired category; its dishes stay in order history but are hidden from ordering.
  const shown = menu.filter((m) => m.category !== "meals");
  const shownCategories = Array.from(new Set(shown.map((m) => m.category)));
  const categoryOrder = ["rice", "swallow", "drinks", "pastries"];
  const categories = [
    ...categoryOrder.filter((c) => shownCategories.includes(c)),
    ...shownCategories.filter((c) => !categoryOrder.includes(c)),
  ];
  const q = search.trim().toLowerCase();
  const visible = shown.filter((m) => (cat === "all" || m.category === cat) && (!q || m.name.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q)));
  const itemCount = cartItems.reduce((a, [, n]) => a + n, 0);
  const methodIcon: Record<string, React.ReactNode> = {
    subscription_entitlement: <CalendarDays className="h-5 w-5" />,
    cash_wallet: <Wallet className="h-5 w-5" />,
    tokens: <Coins className="h-5 w-5" />,
    food_credit: <CreditCard className="h-5 w-5" />,
  };
  const add = (id: string, d: number, source?: HTMLElement) => {
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }));
    if (d <= 0 || !source || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const item = menu.find((m) => m.id === id);
    if (!item) return;
    const art = source.closest("[data-menu-item]")?.querySelector("[data-food-art]") ?? source;
    const origin = art.getBoundingClientRect();
    const food = emojiFor(item.category, item.name);
    // Wait for the first addition to mount the floating basket before measuring its position.
    requestAnimationFrame(() => {
      if (!source.isConnected) return;
      const destination = Array.from(document.querySelectorAll<HTMLElement>("[data-basket-destination]")).find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
      });
      if (!destination) return;
      const target = destination.getBoundingClientRect();
      const fromX = origin.left + origin.width / 2;
      const fromY = origin.top + origin.height / 2;
      const toX = target.left + target.width / 2;
      const toY = target.top + target.height / 2;
      const flight = document.createElement("span");
      flight.textContent = food;
      flight.setAttribute("aria-hidden", "true");
      flight.dataset.basketFlight = "true";
      flight.className = "pointer-events-none fixed left-0 top-0 z-50 grid h-14 w-14 place-items-center rounded-full bg-card/90 text-4xl shadow-glow ring-2 ring-golden/50";
      document.body.appendChild(flight);
      const track = (element: HTMLElement, frames: Keyframe[], duration: number, remove = false) => {
        const animation = element.animate(frames, { duration, easing: "linear" });
        basketAnimations.current.add(animation);
        void animation.finished.catch(() => {}).finally(() => {
          basketAnimations.current.delete(animation);
          if (remove) element.remove();
        });
        return animation;
      };
      const arcHeight = Math.min(160, Math.max(65, fromY - 70));
      const frames = Array.from({ length: 21 }, (_, index) => {
        const t = index / 20;
        const x = fromX + (toX - fromX) * t - 28;
        const y = fromY + (toY - fromY) * t - 4 * arcHeight * t * (1 - t) - 28;
        const scale = t < 0.3 ? 1 + t : 1.3 - ((t - 0.3) / 0.7) * 1.1;
        return { offset: t, transform: `translate3d(${x}px, ${y}px, 0) rotate(${t * 630}deg) scale(${scale})`, opacity: t < 0.9 ? 1 : (1 - t) * 10 };
      });
      const animation = track(flight, frames, 850, true);
      void animation.finished.then(() => {
        if (!destination.isConnected) return;
        track(destination, [
          { transform: "scale(1) rotate(0deg)" },
          { transform: "translateY(7px) scale(1.18, .82) rotate(-10deg)", offset: 0.22 },
          { transform: "translateY(-9px) scale(.9, 1.12) rotate(8deg)", offset: 0.5 },
          { transform: "translateY(2px) scale(1.04) rotate(-3deg)", offset: 0.75 },
          { transform: "scale(1) rotate(0deg)" },
        ], 460);
        const burst = document.createElement("span");
        burst.setAttribute("aria-hidden", "true");
        burst.className = "pointer-events-none fixed left-0 top-0 z-50 h-14 w-14 rounded-full border-4 border-golden";
        document.body.appendChild(burst);
        track(burst, [
          { transform: `translate(${toX - 28}px, ${toY - 28}px) scale(.5)`, opacity: 0.9 },
          { transform: `translate(${toX - 28}px, ${toY - 28}px) scale(2)`, opacity: 0 },
        ], 420, true);
      }).catch(() => {});
    });
  };

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
                <div key={item.id} data-menu-item className={`group flex min-w-0 flex-col rounded-3xl border bg-card p-3 shadow-soft transition-all hover:-translate-y-1 hover:shadow-glow sm:p-4 ${qty > 0 ? "border-primary ring-2 ring-primary/30" : "border-border/60"} ${item.is_available ? "" : "opacity-50"}`}>
                  <div className="relative grid aspect-[4/3] place-items-center rounded-2xl bg-canvas text-5xl transition-transform group-hover:scale-[1.03] sm:text-6xl">
                    <span data-food-art className="transition-transform group-hover:rotate-6 group-hover:scale-110">{emojiFor(item.category, item.name)}</span>
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
                      <Button size="icon" className="h-9 w-9 rounded-full" disabled={!item.is_available} onClick={(event) => add(item.id, 1, event.currentTarget)} aria-label={`Add ${item.name}`}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1 rounded-full bg-canvas p-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => add(item.id, -1)} aria-label={`Remove ${item.name}`}><Minus className="h-3 w-3" /></Button>
                        <span className="w-5 animate-pop-in text-center text-sm font-bold">{qty}</span>
                        <Button size="icon" className="h-7 w-7 rounded-full" disabled={!item.is_available} onClick={(event) => add(item.id, 1, event.currentTarget)} aria-label={`Add ${item.name}`}><Plus className="h-3 w-3" /></Button>
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
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><span data-basket-destination className="inline-flex"><ShoppingBasket className="h-5 w-5 text-primary" /></span> Your order</h2>
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
      {itemCount > 0 && !cartVisible && (
        <Button
          size="icon"
          data-basket-destination
          aria-label={`View basket, ${itemCount} item${itemCount === 1 ? "" : "s"}, ${naira(totalKobo)}`}
          title="View your basket"
          aria-controls="cart"
          onClick={() => document.getElementById("cart")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })}
          className="fixed bottom-6 right-5 z-40 h-16 w-16 rounded-full border-4 border-card bg-primary text-primary-foreground shadow-glow transition-transform hover:-translate-y-1 hover:scale-105 active:scale-95 motion-reduce:transition-none xl:hidden"
        >
          <ShoppingBasket className="h-8 w-8 animate-wiggle" />
          <span key={itemCount} className="absolute -right-1 -top-1 grid h-6 min-w-6 animate-pop-in place-items-center rounded-full border-2 border-card bg-golden px-1 text-xs font-extrabold text-golden-foreground" aria-hidden="true">
            {itemCount > 99 ? "99+" : itemCount}
          </span>
        </Button>
      )}
    </div>
  );
}

function emojiFor(category: string, name = ""): string {
  const s = `${name} ${category}`.toLowerCase();
  if (category === "all" && !name) return "🍽️";
  if (s.includes("shawarma")) return "🌯";
  if (s.includes("pie")) return "🥧";
  if (s.includes("bun")) return "🍩";
  if (s.includes("pastr")) return "🥐";
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
