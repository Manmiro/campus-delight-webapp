import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Coins, Wallet, CreditCard, Bell, ArrowRight, ShoppingBag, CalendarDays, Gift, ReceiptText } from "lucide-react";
import heroMeal from "@/assets/hero-meal.jpg";
import { toast } from "sonner";
import { initializePayment } from "@/lib/payments.functions";
import {
  profileQuery, walletQuery, tokenAccountQuery, subscriptionsQuery, todayEntitlementsQuery,
  creditQuery, loansQuery, ordersQuery, notificationsQuery, referralsQuery,
} from "@/lib/queries";
import { FunZone } from "@/components/fun/fun-zone";
import { naira, tokens as fmtTokens, planLabel, tierLabel, formatDate, formatDateTime } from "@/lib/format";
import { DEFAULT_CREDIT_LIMIT_KOBO } from "@/lib/prd-rules";
import { StatusBadge, StatCard, EmptyState, PageLoader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/_customer/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "My Campus Delight — Meals & Wallet" }, { name: "description", content: "View your meals, wallet, rewards and recent Campus Delight orders." }, { property: "og:title", content: "My Campus Delight — Meals & Wallet" }, { property: "og:description", content: "Your campus meals, wallet and rewards in one place." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
});

function Dashboard() {
  const qc = useQueryClient();
  const initPayment = useServerFn(initializePayment);

  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: wallet } = useSuspenseQuery(walletQuery);
  const { data: tk } = useSuspenseQuery(tokenAccountQuery);
  const { data: subs } = useSuspenseQuery(subscriptionsQuery);
  const { data: ents } = useSuspenseQuery(todayEntitlementsQuery);
  const { data: credit } = useSuspenseQuery(creditQuery);
  const { data: loans } = useSuspenseQuery(loansQuery);
  const { data: orders } = useSuspenseQuery(ordersQuery);
  const { data: notifs } = useSuspenseQuery(notificationsQuery);
  const { data: referrals } = useSuspenseQuery(referralsQuery);

  const activeSub = subs.find((s) => s.status === "active");
  const entToday = ents.filter((e) => e.subscription_id === activeSub?.id);
  const mealsAllowed = entToday.reduce((a, e) => a + e.allowance, 0);
  const mealsUsed = entToday.reduce((a, e) => a + e.redeemed, 0);
  const openLoan = loans.find((l) => ["active", "partially_repaid", "overdue"].includes(l.status));

  const fundWallet = useMutation({
    mutationFn: async () => {
      const result = await initPayment({ data: { purpose: "wallet_funding", amountKobo: 200000, origin: window.location.origin } });
      window.location.href = result.authorizationUrl;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start payment"),
  });

  const referralLink = `${window.location.origin}/auth?mode=signup&ref=${profile.referral_code}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative overflow-hidden rounded-3xl bg-foreground text-background shadow-soft">
          <img src={heroMeal} alt="Jollof rice with grilled chicken and plantain" width={1200} height={640} className="absolute inset-0 h-full w-full object-cover object-right opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-r from-foreground via-foreground/80 to-transparent" />
          <div className="relative max-w-md p-6 sm:p-8">
            <p className="text-sm opacity-80">Welcome back, {profile.full_name.split(" ")[0]}</p>
            <p className="mt-1 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
              Eat well,<br /><span className="text-primary">study better.</span>
            </p>
            <p className="mt-2 text-sm opacity-80">{profile.outlet?.name ?? "No outlet yet"}</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild className="h-auto min-h-11 rounded-full px-5 py-2.5">
                <Link to="/order"><ShoppingBag className="mr-2 h-4 w-4" /> Order food</Link>
              </Button>
              <Button asChild variant="secondary" className="h-auto min-h-11 whitespace-normal rounded-full px-5 py-2.5">
                <Link to="/credit"><CreditCard className="mr-2 h-4 w-4 shrink-0" /> Eat now, pay later <ArrowRight className="ml-2 h-4 w-4 shrink-0" /></Link>
              </Button>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-5">
            <p className="font-display font-bold">Your balance</p>
            <div className="mt-3 rounded-2xl bg-gradient-brand p-5 text-primary-foreground shadow-glow">
              <div className="flex items-center justify-between text-xs opacity-85"><span>Cash wallet</span><Wallet className="h-4 w-4" /></div>
              <p className="mt-2 break-words font-display text-3xl font-extrabold">{naira(wallet?.balance_kobo)}</p>
              <div className="mt-4 flex items-end justify-between gap-2 font-mono text-xs opacity-90">
                <span>{profile.customer_code}</span>
                <span className="text-right">{fmtTokens(tk?.available_tokens)} tokens</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button className="rounded-xl" onClick={() => fundWallet.mutate()} disabled={fundWallet.isPending}>Fund ₦2,000</Button>
              <Button variant="outline" className="rounded-xl" onClick={() => { void navigator.clipboard.writeText(referralLink); toast.success("Referral link copied"); }}>
                <Copy className="mr-1.5 h-4 w-4" /> Refer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <FunZone orders={orders} loans={loans} referrals={referrals} dob={profile.date_of_birth} firstName={profile.full_name.split(" ")[0] ?? ""} />



      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Cash wallet" value={naira(wallet?.balance_kobo)} icon={<Wallet className="h-5 w-5 text-primary" />}
          hint={
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => fundWallet.mutate()} disabled={fundWallet.isPending}>
              Fund ₦2,000 with Paystack <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          } />
        <StatCard label="Available tokens" value={fmtTokens(tk?.available_tokens)} icon={<Coins className="h-5 w-5 text-golden" />}
          hint={`${fmtTokens(tk?.locked_tokens)} locked`} />
        <StatCard label="Meals today" value={`${mealsAllowed - mealsUsed} of ${mealsAllowed}`}
          icon={<CreditCard className="h-5 w-5 text-primary" />}
          hint={activeSub ? `${planLabel(activeSub.plan)} · ${tierLabel(activeSub.tier)}` : "No active subscription"} />
        <StatCard label="Borrowing power" value={naira((credit?.credit_limit_kobo ?? DEFAULT_CREDIT_LIMIT_KOBO) - (credit?.outstanding_kobo ?? 0))}
          icon={<CreditCard className="h-5 w-5 text-golden" />}
          hint={openLoan ? `Repay your open loan before borrowing again` : `Limit ₦${((credit?.credit_limit_kobo ?? DEFAULT_CREDIT_LIMIT_KOBO) / 100).toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { to: "/subscription", label: "Meal plans", icon: <CalendarDays className="h-5 w-5" />, tone: "bg-secondary text-secondary-foreground" },
          { to: "/tokens", label: "Tokens", icon: <Coins className="h-5 w-5" />, tone: "bg-accent text-accent-foreground" },
          { to: "/refer", label: "Refer & earn", icon: <Gift className="h-5 w-5" />, tone: "bg-gradient-golden text-golden-foreground" },
          { to: "/history", label: "History", icon: <ReceiptText className="h-5 w-5" />, tone: "bg-gradient-brand text-primary-foreground" },
        ].map((t) => (
          <Link key={t.to} to={t.to} className={`flex min-h-24 flex-col justify-between rounded-3xl p-4 font-display font-bold shadow-soft transition-transform hover:-translate-y-0.5 ${t.tone}`}>
            {t.icon}<span>{t.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">Recent orders</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <EmptyState title="No orders yet" hint="Order your first meal from your outlet.">
                <Button asChild size="sm"><Link to="/order">Order food</Link></Button>
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {orders.slice(0, 5).map((o) => (
                  <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm">
                    <div className="min-w-0 break-words">
                      <p className="break-all font-medium">{o.reference}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(o.created_at)} · {o.order_items.map((i: { item_name: string; quantity: number }) => `${i.item_name} ×${i.quantity}`).join(", ")}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{o.total_kobo === 0 ? "Entitlement" : naira(o.total_kobo)}</p>
                      <StatusBadge status={o.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Notifications</CardTitle></CardHeader>
            <CardContent>
              {notifs.length === 0 ? (
                <p className="text-sm text-muted-foreground"><Bell className="mr-1 inline h-4 w-4" /> Nothing new yet.</p>
              ) : (
                <ul className="space-y-3">
                  {notifs.slice(0, 5).map((n) => (
                    <li key={n.id} className="text-sm">
                      <p className="font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Subscription</CardTitle></CardHeader>
            <CardContent>
              {activeSub ? (
                <div className="text-sm">
                  <p className="font-semibold">{planLabel(activeSub.plan)} · {tierLabel(activeSub.tier)}</p>
                  <p className="mt-1 text-muted-foreground">{formatDate(activeSub.start_date)} → {formatDate(activeSub.end_date)}</p>
                  <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/subscription">Manage</Link></Button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  <p>No active subscription.</p>
                  <Button asChild size="sm" className="mt-3"><Link to="/subscription">Browse plans</Link></Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

