import { useSuspenseQuery } from "@tanstack/react-query";
import { staffAssignmentQuery, outletOrdersQuery, outletCustomersQuery } from "@/lib/queries";
import { naira } from "@/lib/format";
import { StatCard } from "@/components/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/_outlet/reports")({
  component: OutletReports,
  head: () => ({ meta: [{ title: "Reports — Campus Delight" }] }),
});

function OutletReports() {
  const { data: assignment } = useSuspenseQuery(staffAssignmentQuery);
  const outletId = assignment?.outlet_id ?? "";
  const { data: orders } = useSuspenseQuery(outletOrdersQuery(outletId));
  const { data: customers } = useSuspenseQuery(outletCustomersQuery(outletId));

  const live = orders.filter((o) => o.status !== "cancelled");
  const revenue = live.reduce((a, o) => a + o.total_kobo, 0);
  const byMethod = live.reduce<Record<string, { count: number; total: number }>>((acc, o) => {
    const key = o.payment_method;
    acc[key] = acc[key] ?? { count: 0, total: 0 };
    acc[key].count += 1;
    acc[key].total += o.total_kobo;
    return acc;
  }, {});
  const itemCount = live
    .flatMap((o) => o.order_items)
    .reduce<Record<string, number>>((acc, i: { item_name: string; quantity: number }) => {
      acc[i.item_name] = (acc[i.item_name] ?? 0) + i.quantity;
      return acc;
    }, {});
  const topItems = Object.entries(itemCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const last7 = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - idx));
    const key = d.toDateString();
    const dayOrders = live.filter((o) => new Date(o.created_at).toDateString() === key);
    return { label: d.toLocaleDateString("en-NG", { weekday: "short" }), count: dayOrders.length, total: dayOrders.reduce((a, o) => a + o.total_kobo, 0) };
  });
  const maxDay = Math.max(1, ...last7.map((d) => d.total));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Revenue" value={naira(revenue)} hint={`${live.length} live orders`} />
        <StatCard label="Customers" value={customers.length} />
        <StatCard
          label="Avg order value"
          value={naira(live.length ? Math.round(revenue / live.length) : 0)}
        />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Last 7 days</CardTitle></CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-3">
            {last7.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-lg bg-primary/80"
                  style={{ height: `${Math.max(4, (d.total / maxDay) * 100)}%` }}
                  title={naira(d.total)}
                />
                <span className="text-[11px] text-muted-foreground">{d.label}</span>
                <span className="text-[10px] font-semibold">{d.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Revenue by payment method</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {Object.entries(byMethod).map(([m, v]) => (
                <li key={m} className="flex justify-between">
                  <span className="capitalize">{m.replace("_", " ")}</span>
                  <span className="font-semibold">{naira(v.total)} <span className="text-xs text-muted-foreground">({v.count})</span></span>
                </li>
              ))}
              {Object.keys(byMethod).length === 0 && <p className="text-muted-foreground">No sales yet.</p>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Top items</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {topItems.map(([name, qty]) => (
                <li key={name} className="flex justify-between">
                  <span>{name}</span>
                  <span className="font-semibold">×{qty}</span>
                </li>
              ))}
              {topItems.length === 0 && <p className="text-muted-foreground">No sales yet.</p>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
