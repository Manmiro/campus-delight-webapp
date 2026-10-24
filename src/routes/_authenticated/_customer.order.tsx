import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, ShieldCheck, Timer } from "lucide-react";
import { profileQuery, myMenuQuery, subscriptionsQuery, todayEntitlementsQuery, walletQuery, tokenAccountQuery, creditQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { naira, planLabel, tierLabel } from "@/lib/format";
import { orderPaymentOptions } from "@/lib/prd-rules";
import { EmptyState, StatusBadge, PageLoader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const availableCredit = (credit?.credit_limit_kobo ?? 0) - (credit?.outstanding_kobo ?? 0);

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
    { value: "tokens", label: `Tokens — ${tk?.available_tokens ?? 0}`, disabled: !payEnabled.tokens },
    { value: "food_credit", label: "Eat Now & Pay Later", disabled: !payEnabled.food_credit },
  ];

  const categories = Array.from(new Set(menu.map((m) => m.category)));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {categories.map((cat) => (
          <div key={cat}>
            <h2 className="mb-3 font-display text-lg font-semibold capitalize">{cat}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {menu.filter((m) => m.category === cat).map((item) => (
                <Card key={item.id} className={item.is_available ? "" : "opacity-50"}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                      <p className="mt-1 text-sm font-bold text-primary">{naira(item.price_kobo)}</p>
                      {item.is_credit_eligible && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-golden">
                          <Timer className="h-3 w-3" /> Pay-later eligible
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCart((c) => ({ ...c, [item.id]: Math.max(0, (c[item.id] ?? 0) - 1) }))}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-semibold">{cart[item.id] ?? 0}</span>
                      <Button variant="outline" size="icon" className="h-8 w-8" disabled={!item.is_available} onClick={() => setCart((c) => ({ ...c, [item.id]: (c[item.id] ?? 0) + 1 }))}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Card className="sticky top-20 h-fit">
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Your order</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {cartItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tap + to add items from the menu.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {cartItems.map(([id, qty]) => {
                const item = menu.find((m) => m.id === id);
                if (!item) return null;
                return (
                  <li key={id} className="flex justify-between">
                    <span>{item.name} ×{qty}</span>
                    <span>{naira(item.price_kobo * qty)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex justify-between border-t border-border pt-3 font-semibold">
            <span>Total</span>
            <span className="font-display text-lg">{naira(totalKobo)}</span>
          </div>

          <div>
            <Label className="text-xs">Pay with (one method only)</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Choose payment method" /></SelectTrigger>
              <SelectContent>
                {methodOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value} disabled={o.disabled}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">Cash and tokens can never be combined on one purchase.</p>
          </div>

          {method === "food_credit" && (
            <div className="rounded-xl bg-accent p-3 text-sm">
              <div className="flex items-center justify-between">
                <Label htmlFor="term" className="text-xs">Repayment term</Label>
                <Select value={termDays} onValueChange={setTermDays}>
                  <SelectTrigger id="term" className="h-8 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TERMS.map((t) => (
                      <SelectItem key={t.days} value={String(t.days)}>{t.days} days · {t.pct}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <dl className="mt-2 space-y-1 text-xs">
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
            <div className="flex items-center gap-2 rounded-xl bg-secondary/60 p-3 text-sm text-secondary-foreground">
              <ShieldCheck className="h-4 w-4" />
              {planLabel(activeSub.plan)} · {tierLabel(activeSub.tier)} — {mealsLeft} meal{mealsLeft === 1 ? "" : "s"} left today
            </div>
          )}

          <Button className="w-full" disabled={cartItems.length === 0 || !method || !methodOptions.some(o => o.value === method && !o.disabled) || placeOrder.isPending} onClick={() => placeOrder.mutate()}>
            {placeOrder.isPending && <LoaderPlaceholder />} Confirm order
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function LoaderPlaceholder() {
  return <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}
