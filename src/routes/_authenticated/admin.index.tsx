import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, createFileRoute } from "@tanstack/react-router";
import { naira, tokens as fmtTokens, formatDateTime } from "@/lib/format";
import { StatCard } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverview,
  head: () => ({ meta: [{ title: "Global Overview — Campus Delight HQ" }] }),
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
    const { data, error } = await supabase.from("loans").select("status, principal_kobo, charge_kobo").order("created_at", { ascending: false }).limit(500);
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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Outlets" value={outletCount} />
        <StatCard label="Registered customers" value={customerCount} />
        <StatCard label="Active subscriptions" value={activeSubs.length} hint={`₦${(subRevenue / 100).toLocaleString()} sold`} />
        <StatCard label="Wallet float" value={naira(walletTotal)} hint={`${fmtTokens(tokenTotal)} tokens issued`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Outstanding loans" value={naira(outstanding)} hint={overdue > 0 ? `${overdue} overdue` : "None overdue"} />
        <StatCard label="Timely repayment rate" value={loans.length ? `${Math.round((loans.filter((l) => l.status === "fully_repaid_on_time").length / loans.length) * 100)}%` : "—"} />
      </div>

      <Card>
        <CardHeader className="pb-2" >
          <CardTitle className="font-display text-lg">Recent admin activity</CardTitle>
          <Button asChild variant="link" size="sm" className="self-start p-0"><Link to="/admin/audit">Full audit log</Link></Button>
        </CardHeader>
        <CardContent>
          {(audit ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No administrative actions recorded yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(audit ?? []).map((a) => (
                <li key={a.id} className="flex justify-between border-b border-border/60 pb-2">
                  <span><span className="font-semibold">{a.action}</span> · {a.entity}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Launch outlets</CardTitle></CardHeader>
        <CardContent>
          <OutletTable />
        </CardContent>
      </Card>
    </div>
  );
}

function OutletTable() {
  const { data: outlets } = useQuery({
    queryKey: ["admin", "outlets-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outlets").select("id, name, code, location, status").order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Outlet</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Code</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(outlets ?? []).map((o) => (
          <TableRow key={o.id}>
            <TableCell className="text-sm font-medium">{o.name}</TableCell>
            <TableCell className="text-xs">{o.location}</TableCell>
            <TableCell className="font-mono text-xs">{o.code}</TableCell>
            <TableCell className="text-xs capitalize">{o.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
