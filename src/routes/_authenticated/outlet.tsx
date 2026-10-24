import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import {
  ClipboardList, LayoutDashboard, ShoppingBag, Users, UtensilsCrossed, BarChart3, UserCog,
} from "lucide-react";
import { getMyRole } from "@/lib/roles.functions";
import { AppShell, type NavItem } from "@/components/app-shell";

export const Route = createFileRoute("/outlet")({
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
];

function OutletLayout() {
  return (
    <AppShell nav={nav} title="Outlet Console" subtitle="Run your Campus Delight outlet.">
      <Outlet />
    </AppShell>
  );
}
