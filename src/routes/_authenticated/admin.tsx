import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import {
  BarChart3, Building2, Landmark, LayoutDashboard, ScrollText, Settings, Users, Vote,
} from "lucide-react";
import { getMyRole } from "@/lib/roles.functions";
import { AppShell, type NavItem } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const role = await getMyRole();
    if (role !== "central_admin") {
      throw redirect({ to: role.startsWith("outlet") ? "/outlet" : "/dashboard" });
    }
  },
  component: AdminLayout,
});

const nav: NavItem[] = [
  { to: "/admin", label: "Global Overview", icon: <LayoutDashboard className="h-4 w-4" />, exact: true },
  { to: "/admin/outlets", label: "Outlet Management", icon: <Building2 className="h-4 w-4" /> },
  { to: "/admin/customers", label: "Customers", icon: <Users className="h-4 w-4" /> },
  { to: "/admin/financial", label: "Financial Oversight", icon: <Landmark className="h-4 w-4" /> },
  { to: "/admin/transfers", label: "Outlet Transfers", icon: <Vote className="h-4 w-4" /> },
  { to: "/admin/credit", label: "Eat Now & Pay Later", icon: <BarChart3 className="h-4 w-4" /> },
  { to: "/admin/audit", label: "Audit Logs", icon: <ScrollText className="h-4 w-4" /> },
  { to: "/admin/settings", label: "System Settings", icon: <Settings className="h-4 w-4" /> },
];

function AdminLayout() {
  return (
    <AppShell nav={nav} title="Headquarters Console" subtitle="Campus Delight Solutions Limited — central administration.">
      <Outlet />
    </AppShell>
  );
}

