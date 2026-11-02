import { useEffect, useRef, useState } from "react";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { staffAssignmentQuery, outletOrdersQuery, outletCustomersQuery, myMenuQuery, profileQuery } from "@/lib/queries";
import { setOutletOrderAlarm } from "@/lib/outlet.functions";
import { outletOrderAlarmMessage } from "@/lib/outlet-alarm";
import { naira } from "@/lib/format";
import { StatCard, PageLoader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/outlet/")({
  component: OutletOverview,
  head: () => ({ meta: [{"title": "Outlet Overview — Campus Delight"}, {"name": "description", "content": "View and manage outlet overview in your Campus Delight account."}, {"property": "og:title", "content": "Outlet Overview — Campus Delight"}, {"property": "og:description", "content": "View and manage outlet overview in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

function OutletOverview() {
  const saveAlarm = useServerFn(setOutletOrderAlarm);
  const { data: assignment } = useSuspenseQuery(staffAssignmentQuery);
  const outletId = assignment?.outlet_id ?? "";
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: orders } = useSuspenseQuery({ ...outletOrdersQuery(outletId), refetchInterval: 10_000, refetchIntervalInBackground: false });
  const { data: customers } = useSuspenseQuery(outletCustomersQuery(outletId));
  const { data: menu } = useSuspenseQuery(myMenuQuery(outletId));
  const isManager = assignment?.staff_role === "outlet_manager";
  const [alarmEnabled, setAlarmEnabled] = useState(profile.outlet_order_alarm_enabled ?? true);
  const seenOrderIds = useRef<Set<string>>(new Set());
  const hasHydratedOrders = useRef(false);

  const alarmMutation = useMutation({
    mutationFn: (enabled: boolean) => saveAlarm({ data: { enabled } }),
    onMutate: (enabled) => setAlarmEnabled(enabled),
    onSuccess: (_result, enabled) => toast.success(`New-order alarm ${enabled ? "on" : "off"}`),
    onError: (error, enabled) => {
      setAlarmEnabled(!enabled);
      toast.error(error instanceof Error ? error.message : "Could not update the order alarm");
    },
  });

  useEffect(() => {
    if (!isManager || !outletId) return;
    const currentIds = new Set(orders.map((order) => order.id));
    if (!hasHydratedOrders.current) {
      seenOrderIds.current = currentIds;
      hasHydratedOrders.current = true;
      return;
    }

    const freshOrders = orders.filter((order) => !seenOrderIds.current.has(order.id));
    seenOrderIds.current = currentIds;
    if (!alarmEnabled) return;

    for (const order of freshOrders) {
      if (order.status !== "confirmed") continue;
      const message = outletOrderAlarmMessage(order.customer?.full_name, outletId);
      toast.info(message, { duration: 12_000 });
      try {
        navigator.vibrate?.([220, 100, 220]);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("New Campus Delight order", { body: message });
        }
        const audio = new AudioContext();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = 880;
        gain.gain.value = 0.08;
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.18);
      } catch {
        // Browser notification/audio permissions are optional; the toast remains visible.
      }
    }
  }, [alarmEnabled, isManager, orders, outletId]);

  async function toggleAlarm(enabled: boolean) {
    if (enabled && "Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    alarmMutation.mutate(enabled);
  }

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

      {isManager && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="font-semibold">New-order alarm</p>
              <p className="text-sm text-muted-foreground">{alarmEnabled ? "On — new confirmed orders will alert this dashboard." : "Off — new orders will not trigger an alarm."}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{alarmEnabled ? "On" : "Off"}</span>
              <Switch checked={alarmEnabled} disabled={alarmMutation.isPending} onCheckedChange={toggleAlarm} aria-label="Toggle new-order alarm" />
            </div>
          </CardContent>
        </Card>
      )}

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
