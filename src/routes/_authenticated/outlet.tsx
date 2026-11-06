import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ClipboardList, Home, LayoutDashboard, MessageSquare, ShoppingBag, Users, UtensilsCrossed, BarChart3, UserCog,
} from "lucide-react";
import { getMyRole } from "@/lib/roles.functions";
import { personalDashboardLink } from "@/lib/role-nav";
import { staffAssignmentQuery, outletOrdersQuery, profileQuery } from "@/lib/queries";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { unlockOutletOrderAlarmAudio, useOutletOrderAlarmListener } from "@/lib/outlet-alarm";
import { AppShell, type NavItem } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/outlet")({
  beforeLoad: async () => {
    const role = await getMyRole();
    if (!role.startsWith("outlet")) {
      throw redirect({ to: role === "central_admin" ? "/admin" : "/dashboard" });
    }
  },
  component: OutletLayout,
});

const nav: NavItem[] = [
  { to: "/outlet", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { to: "/outlet/orders", label: "Orders & Fulfillment", icon: <ClipboardList className="h-4 w-4" /> },
  { to: "/outlet/menu", label: "Menu & Pricing", icon: <UtensilsCrossed className="h-4 w-4" /> },
  { to: "/outlet/subscriptions", label: "Subscriptions", icon: <ShoppingBag className="h-4 w-4" /> },
  { to: "/outlet/customers", label: "Customers", icon: <Users className="h-4 w-4" /> },
  { to: "/outlet/staff", label: "Staff", icon: <UserCog className="h-4 w-4" /> },
  { to: "/outlet/reports", label: "Reports", icon: <BarChart3 className="h-4 w-4" /> },
  { to: "/outlet/messages", label: "Messages", icon: <MessageSquare className="h-4 w-4" /> },
];

function OutletLayout() {
  const { data: role } = useQuery({ queryKey: ["my-role"], queryFn: () => getMyRole() });
  const personal = role ? personalDashboardLink(role) : null;
  const navList: NavItem[] = personal
    ? [...nav, { to: personal.to, label: personal.label, icon: <Home className="h-4 w-4" /> }]
    : nav;

  return (
    <AppShell nav={navList} title="Outlet Console" subtitle="Run your Campus Delight outlet.">
      <OutletOrderAlarmListener />
      <Outlet />
    </AppShell>
  );
}

function OutletOrderAlarmListener() {
  const queryClient = useQueryClient();
  const { data: assignment } = useSuspenseQuery(staffAssignmentQuery);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const outletId = assignment?.outlet_id ?? "";
  const { data: orders } = useSuspenseQuery({
    ...outletOrdersQuery(outletId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!outletId) return;
    const channel = supabase
      .channel(`outlet-orders:${outletId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `outlet_id=eq.${outletId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: outletOrdersQuery(outletId).queryKey });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [outletId, queryClient]);

  useEffect(() => {
    const unlock = () => { void unlockOutletOrderAlarmAudio(); };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useOutletOrderAlarmListener({
    active: assignment?.staff_role === "outlet_manager",
    alarmEnabled: profile.outlet_order_alarm_enabled ?? true,
    orders,
    outletId,
  });
  return null;
}
