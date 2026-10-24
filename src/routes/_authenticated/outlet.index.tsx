import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { staffAssignmentQuery, outletOrdersQuery, outletCustomersQuery, myMenuQuery, subscriptionsQuery } from "@/lib/queries";
import { naira } from "@/lib/format";
import { StatCard, PageLoader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/outlet/")({
  component: OutletOverview,
  head: () => ({ meta: [{ title: "Outlet Overview — Campus Delight" }] }),
});

function OutletOverview() {
  const { data: assignment } = useSuspenseQuery(staffAssignmentQuery);
  const outletId = assignment?.outlet_id ?? "";
  const { data: orders } = useSuspenseQuery(outletOrdersQuery(outletId));
  const { data: customers } = useSuspenseQuery(outletCustomersQuery(outletId));
  const { data: menu } = useSuspenseQuery(myMenuQuery(outletId));

  const today = new Date().toDateString();
  const todaysOrders = orders.filter((o) => new Date(o.created_at).toDateString() === today);
  const pending = orders.filter((o) => o.status === "confirmed");
  const revenue = orders.filter((o) => o.status !== "cancelled").reduce((a, o) => a + o.total_kobo, 0);

  if (!assignment) return <PageLoader label="Loading your outlet…" />;

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-primary text-primary-foreground">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
          <div>
            <p className="font-display text-xl font-bold">{assignment.outlet?.name}</p>
            <p className="text-sm opacity-80">{assignment.outlet?.location} · {assignment.staff_role === "outlet_manager" ? "Manager" : "Staff"}</p>
          </div>
          <Badge variant="outline" className="border-white/30 bg-white/10 text-white">{assignment.outlet?.code}</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Orders today" value={todaysOrders.length} />
        <StatCard label="Awaiting fulfillment" value={pending.length} hint={pending.length > 0 ? "Attend to these now" : "All caught up"} />
        <StatCard label="Revenue (all time)" value={naira(revenue)} />
        <StatCard label="Customers" value={customers.length} hint={`${menu.length} menu items published`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" className="w-full justify-start"><Link to="/outlet/orders">Fulfill orders</Link></Button>
            <Button asChild variant="outline" className="w-full justify-start"><Link to="/outlet/menu">Edit menu & prices</Link></Button>
            <Button asChild variant="outline" className="w-full justify-start"><Link to="/outlet/reports">View reports</Link></Button>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Latest orders</CardTitle></CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet today.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {orders.slice(0, 6).map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium">{o.customer?.full_name ?? o.customer?.customer_code}</p>
                      <p className="text-xs text-muted-foreground">{o.order_items.map((i: { item_name: string; quantity: number }) => `${i.item_name} ×${i.quantity}`).join(", ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{naira(o.total_kobo)}</p>
                      <Badge variant="outline" className="text-[10px]">{o.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
