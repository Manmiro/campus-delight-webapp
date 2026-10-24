import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays, Coins, CreditCard, Gift, Home, ReceiptText, Send, ShoppingBag, SwapHoriz, UserRound, Wallet,
} from "lucide-react";
import { getMyRole } from "@/lib/roles.functions";
import { AppShell, type NavItem } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/_customer")({
  beforeLoad: async () => {
    const role = await getMyRole();
    if (role !== "customer") {
      throw redirect({ to: role === "central_admin" ? "/admin" : "/outlet" });
    }
  },
  component: CustomerLayout,
});

const nav: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: <Home className="h-4 w-4" />, exact: true },
  { to: "/subscription", label: "My Subscription", icon: <CalendarDays className="h-4 w-4" /> },
  { to: "/order", label: "Order Food", icon: <ShoppingBag className="h-4 w-4" /> },
  { to: "/wallet", label: "Wallet", icon: <Wallet className="h-4 w-4" /> },
  { to: "/tokens", label: "Tokens", icon: <Coins className="h-4 w-4" /> },
  { to: "/transfer-tokens", label: "Transfer Tokens", icon: <Send className="h-4 w-4" /> },
  { to: "/refer", label: "Refer & Earn", icon: <Gift className="h-4 w-4" /> },
  { to: "/credit", label: "Eat Now & Pay Later", icon: <CreditCard className="h-4 w-4" /> },
  { to: "/repayments", label: "Loan Repayments", icon: <ReceiptText className="h-4 w-4" /> },
  { to: "/history", label: "Transaction History", icon: <ReceiptText className="h-4 w-4" /> },
  { to: "/transfer-outlet", label: "Transfer Outlet", icon: <SwapHoriz className="h-4 w-4" /> },
  { to: "/profile", label: "Profile & Support", icon: <UserRound className="h-4 w-4" /> },
];

function CustomerLayout() {
  return (
    <AppShell title="My Campus Delight" subtitle="Your outlet, meals, wallet and rewards in one place.">
      <Outlet />
    </AppShell>
  );
}

export { nav as customerNav };
