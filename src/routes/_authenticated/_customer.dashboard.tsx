import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Coins, Wallet, CreditCard, Bell, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { initializePayment } from "@/lib/payments.functions";
import {
  profileQuery, walletQuery, tokenAccountQuery, subscriptionsQuery, todayEntitlementsQuery,
  creditQuery, loansQuery, ordersQuery, notificationsQuery,
} from "@/lib/queries";
import { naira, tokens as fmtTokens, planLabel, tierLabel, formatDate, formatDateTime } from "@/lib/format";
import { StatusBadge, StatCard, EmptyState, PageLoader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/_customer/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Home — Campus Delight" }] }),
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

  const activeSub = subs.find((s) => s.status === "active");
  const entToday = ents.filter((e) => e.subscription_id === activeSub?.id);
  const mealsAllowed = entToday.reduce((a, e) => a + e.allowance, 0);
  const mealsUsed = entToday.reduce((a, e) => a + e.redeemed, 0);
  const openLoan = loans.find((l) => ["active", "partially_repaid", "overdue"].includes(l.status));

  const fundWallet = useMutation({
    mutationFn: async () => {
      const result = await initPayment({ data: { purpose: "wallet_funding", amountKobo: 200000 } });
      window.location.href = result.authorizationUrl;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start payment"),
  });

  const referralLink = `${window.location.origin}/auth?mode=signup&ref=${profile.referral_code}`;

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-primary text-primary-foreground">
        <CardContent className="p-6">
          <p className="text-sm opacity-80">Welcome back, {profile.full_name.split(" ")[0]}</p>
          <p className="font-display text-xl font-bold">{profile.outlet_id ? "Your Campus Delight outlet" : "No outlet yet"}</p>
          <p className="mt-1 font-mono text-xs opacity-80">ID: {profile.customer_code}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => {
              void navigator.clipboard.writeText(referralLink);
              toast.success("Referral link copied");
            }}
          >
            <Copy className="mr-2 h-4 w-4" /> Copy referral link
          </Button>
        </CardContent>
      </Card>

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
        <StatCard label="Borrowing power" value={naira((credit?.credit_limit_kobo ?? 210000) - (credit?.outstanding_kobo ?? 0))}
          icon={<CreditCard className="h-5 w-5 text-golden" />}
          hint={openLoan ? `Outstanding ${naira(openLoan.total_due_kobo + openLoan.overdue_kobo - 0)} — repay it first` : "Limit ₦" + ((credit?.credit_limit_kobo ?? 210000) / 100).toLocaleString()} />
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
                  <li key={o.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium">{o.reference}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(o.created_at)} · {o.order_items.map((i: { item_name: string; quantity: number }) => `${i.item_name} ×${i.quantity}`).join(", ")}</p>
                    </div>
                    <div className="text-right">
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

export const DashboardPage = Dashboard;
export { Dashboard };
