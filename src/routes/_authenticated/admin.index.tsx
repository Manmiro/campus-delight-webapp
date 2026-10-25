import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, createFileRoute } from "@tanstack/react-router";
import { naira, tokens as fmtTokens, formatDateTime } from "@/lib/format";
import { Activity, Building2, CalendarDays, CreditCard, Landmark, MapPin, Search, Settings, Users, Vote, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverview,
  head: () => ({ meta: [{"title": "Global Overview — Campus Delight HQ"}, {"name": "description", "content": "View and manage global overview in your Campus Delight account."}, {"property": "og:title", "content": "Global Overview — Campus Delight HQ"}, {"property": "og:description", "content": "View and manage global overview in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

const outletsQuery = queryOptions({
  queryKey: ["admin", "outlets-count"],
  queryFn: async () => {
    const { count, error } = await supabase.from("outlets").select("id", { count: "exact" });
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
});
const customersQuery = queryOptions({
  queryKey: ["admin", "customers-count"],
  queryFn: async () => {
    const { count, error } = await supabase.from("profiles").select("id", { count: "exact" });
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
});
const subsQuery = queryOptions({
  queryKey: ["admin", "subs"],
  queryFn: async () => {
    const { data, error } = await supabase.from("subscriptions").select("status, price_kobo");
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});
const loansQuery = queryOptions({
  queryKey: ["admin", "loans"],
  queryFn: async () => {
    const { data, error } = await supabase.from("loans").select("status, principal_kobo, charge_kobo, total_due_kobo").order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});
const walletsQuery = queryOptions({
  queryKey: ["admin", "wallets"],
  queryFn: async () => {
    const { data, error } = await supabase.from("wallets").select("balance_kobo");
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});
const tokensQuery = queryOptions({
  queryKey: ["admin", "tokens"],
  queryFn: async () => {
    const { data, error } = await supabase.from("token_accounts").select("available_tokens, locked_tokens");
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});
const auditQuery = queryOptions({
  queryKey: ["admin", "audit-recent"],
  queryFn: async () => {
    const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(8);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

function AdminOverview() {
  const { data: outletCount } = useSuspenseQuery(outletsQuery);
  const { data: customerCount } = useSuspenseQuery(customersQuery);
  const { data: subs } = useSuspenseQuery(subsQuery);
  const { data: loans } = useSuspenseQuery(loansQuery);
  const { data: wallets } = useSuspenseQuery(walletsQuery);
  const { data: tokens } = useSuspenseQuery(tokensQuery);
  const { data: audit } = useQuery(auditQuery);

  const activeSubs = subs.filter((s) => s.status === "active");
  const subRevenue = activeSubs.reduce((a, s) => a + s.price_kobo, 0);
  const walletTotal = wallets.reduce((a, w) => a + w.balance_kobo, 0);
  const tokenTotal = tokens.reduce((a, t) => a + t.available_tokens + t.locked_tokens, 0);
  const outstanding = loans.filter((l) => ["active", "partially_repaid", "overdue"].includes(l.status)).reduce((a, l) => a + l.total_due_kobo, 0);
  const overdue = loans.filter((l) => l.status === "overdue").length;
  const onTime = loans.filter((l) => l.status === "fully_repaid_on_time").length;
  const openLoans = loans.filter((l) => ["active", "partially_repaid"].includes(l.status)).length;
  const otherLoans = Math.max(0, loans.length - onTime - openLoans - overdue);
  const rate = loans.length ? Math.round((onTime / loans.length) * 100) : null;

  const kpis = [
    { icon: Building2, label: "Outlets", value: String(outletCount), hint: "Live campus outlets", tone: "bg-primary/10 text-primary" },
    { icon: Users, label: "Registered customers", value: customerCount.toLocaleString(), hint: "All outlets", tone: "bg-golden/15 text-golden" },
    { icon: CalendarDays, label: "Active subscriptions", value: String(activeSubs.length), hint: `${naira(subRevenue)} sold`, tone: "bg-primary/10 text-primary" },
    { icon: Wallet, label: "Wallet float", value: naira(walletTotal), hint: `${fmtTokens(tokenTotal)} tokens issued`, tone: "bg-golden/15 text-golden" },
  ];

  const actions = [
    { to: "/admin/outlets", icon: Building2, label: "Add or edit outlets" },
    { to: "/admin/customers", icon: Search, label: "Find a customer" },
    { to: "/admin/financial", icon: Landmark, label: "Check money" },
    { to: "/admin/transfers", icon: Vote, label: "Review transfers" },
    { to: "/admin/credit", icon: CreditCard, label: "Pay Later limits" },
    { to: "/admin/settings", icon: Settings, label: "System settings" },
  ] as const;

  const segments = [
    { label: "Repaid on time", count: onTime, color: "var(--primary)" },
    { label: "Open", count: openLoans, color: "var(--golden)" },
    { label: "Overdue", count: overdue, color: "var(--destructive)" },
    { label: "Other", count: otherLoans, color: "var(--muted-foreground)" },
  ];
  let acc = 0;
  const ring = loans.length
    ? `conic-gradient(${segments.map((s) => { const from = acc; acc += (s.count / loans.length) * 360; return `${s.color} ${from}deg ${acc}deg`; }).join(", ")})`
    : "conic-gradient(var(--muted) 0deg 360deg)";

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-brand p-5 text-primary-foreground shadow-glow sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-golden/30 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-sm opacity-85">Headquarters</p>
            <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Everything at a glance</h1>
            <p className="mt-1 max-w-lg text-sm opacity-90">
              {overdue > 0 ? `${overdue} loan${overdue === 1 ? "" : "s"} overdue — worth a look today.` : "All outlets are running smoothly. No loans overdue."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-72">
            <div className="rounded-2xl bg-primary-foreground/15 p-4 backdrop-blur">
              <p className="text-xs opacity-85">Outstanding loans</p>
              <p className="font-display text-xl font-bold">{naira(outstanding)}</p>
            </div>
            <div className="rounded-2xl bg-golden p-4 text-golden-foreground">
              <p className="text-xs opacity-85">On-time rate</p>
              <p className="font-display text-xl font-bold">{rate === null ? "—" : `${rate}%`}</p>
            </div>
          </div>
        </div>
      </section>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="group min-w-0 rounded-3xl border border-border/60 bg-card p-4 shadow-soft transition-all hover:-translate-y-1 hover:shadow-glow sm:p-5">
            <span className={`grid h-11 w-11 place-items-center rounded-2xl transition-transform group-hover:scale-110 ${k.tone}`}>
              <k.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-xs text-muted-foreground sm:text-sm">{k.label}</p>
            <p className="truncate font-display text-xl font-bold sm:text-2xl">{k.value}</p>
            <p className="truncate text-xs text-muted-foreground">{k.hint}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <section className="rounded-3xl border border-border/60 bg-card p-5 shadow-soft">
        <h2 className="font-display text-lg font-bold">What would you like to do?</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {actions.map((a) => (
            <Link key={a.to} to={a.to} className="group flex flex-col items-center gap-2 rounded-2xl bg-canvas p-4 text-center text-sm font-medium transition-all hover:-translate-y-1 hover:bg-primary hover:text-primary-foreground">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-card text-primary shadow-soft">
                <a.icon className="h-5 w-5" />
              </span>
              {a.label}
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* Loan health */}
        <Card className="min-w-0 rounded-3xl">
          <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Pay Later health</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center gap-5 sm:flex-row">
            <div className="relative grid h-36 w-36 shrink-0 place-items-center">
              <div className="absolute inset-0 rounded-full" style={{ background: ring }} />
              <div className="absolute inset-4 rounded-full bg-card" />
              <div className="relative text-center">
                <p className="font-display text-2xl font-bold">{loans.length}</p>
                <p className="text-xs text-muted-foreground">loans</p>
              </div>
            </div>
            <ul className="w-full space-y-2 text-sm">
              {segments.map((s) => (
                <li key={s.label} className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
                  <span className="font-semibold">{s.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Activity */}
        <Card className="min-w-0 rounded-3xl">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="font-display text-lg">Recent admin activity</CardTitle>
            <Button asChild variant="link" size="sm" className="p-0"><Link to="/admin/audit">Full audit log</Link></Button>
          </CardHeader>
          <CardContent>
            {(audit ?? []).length === 0 ? (
              <p className="rounded-2xl bg-canvas p-4 text-sm text-muted-foreground">No administrative actions recorded yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(audit ?? []).map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-canvas px-3 py-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-card text-primary"><Activity className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1 truncate"><span className="font-semibold">{a.action}</span> · {a.entity}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl">
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="font-display text-lg">Launch outlets</CardTitle>
          <Button asChild variant="link" size="sm" className="p-0"><Link to="/admin/outlets">Manage</Link></Button>
        </CardHeader>
        <CardContent>
          <OutletGrid />
        </CardContent>
      </Card>
    </div>
  );
}

function OutletGrid() {
  const { data: outlets } = useQuery({
    queryKey: ["admin", "outlets-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outlets").select("id, name, code, location, status").order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {(outlets ?? []).map((o) => (
        <div key={o.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-canvas p-3 transition-all hover:-translate-y-0.5 hover:ring-2 hover:ring-primary">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-card text-primary"><MapPin className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{o.name}</p>
            <p className="truncate text-xs text-muted-foreground">{o.location} · <span className="font-mono">{o.code}</span></p>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${o.status === "active" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{o.status}</span>
        </div>
      ))}
    </div>
  );
}
