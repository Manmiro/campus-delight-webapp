import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  Store,
  Coins,
  CreditCard,
  Gift,
  Home,
  Trophy,
  ReceiptText,
  Send,
  ShoppingBag,
  ArrowLeftRight,
  UserRound,
  Wallet,
} from "lucide-react";
import { getMyRole } from "@/lib/roles.functions";
import {
  canEnterCustomerArea,
  customerAreaRedirect,
  headquartersLink,
  outletConsoleLink,
} from "@/lib/role-nav";
import { AppShell, type NavItem } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/_customer")({
  beforeLoad: async () => {
    const role = await getMyRole();
    if (!canEnterCustomerArea(role)) {
      throw redirect({ to: customerAreaRedirect(role) });
    }
  },
  component: CustomerLayout,
});

const nav: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: <Home className="h-4 w-4" />, exact: true },
  { to: "/subscription", label: "My Food Plans", icon: <CalendarDays className="h-4 w-4" /> },
  { to: "/order", label: "Order Food", icon: <ShoppingBag className="h-4 w-4" /> },
  { to: "/credit", label: "Eat Now & Pay Later", icon: <CreditCard className="h-4 w-4" /> },
  { to: "/refer", label: "Refer & Earn", icon: <Gift className="h-4 w-4" /> },
  { to: "/wallet", label: "My Wallet", icon: <Wallet className="h-4 w-4" /> },
  { to: "/tokens", label: "My Tokens", icon: <Coins className="h-4 w-4" /> },
  { to: "/transfer-tokens", label: "Transfer Tokens", icon: <Send className="h-4 w-4" /> },
  { to: "/leaderboard", label: "Leaderboard", icon: <Trophy className="h-4 w-4" /> },
  { to: "/repayments", label: "Loan Repayments", icon: <ReceiptText className="h-4 w-4" /> },
  { to: "/history", label: "Transaction History", icon: <ReceiptText className="h-4 w-4" /> },
  {
    to: "/transfer-outlet",
    label: "Transfer Outlet",
    icon: <ArrowLeftRight className="h-4 w-4" />,
  },
  { to: "/profile", label: "Profile & Support", icon: <UserRound className="h-4 w-4" /> },
];

function CustomerLayout() {
  const { data: role } = useQuery({ queryKey: ["my-role"], queryFn: () => getMyRole() });
  const hq = role ? headquartersLink(role) : null;
  const outlet = role ? outletConsoleLink(role) : null;

  const navList: NavItem[] = [
    ...nav,
    ...(outlet
      ? [{ to: outlet.to, label: outlet.label, icon: <Store className="h-4 w-4" /> }]
      : []),
    ...(hq ? [{ to: hq.to, label: hq.label, icon: <Building2 className="h-4 w-4" /> }] : []),
  ];

  return (
    <AppShell
      nav={navList}
      title="My Campus Delight"
      subtitle="Your outlet, meals, wallet and rewards in one place."
      showHeader={false}
    >
      <Outlet />
    </AppShell>
  );
}

export { nav as customerNav };
