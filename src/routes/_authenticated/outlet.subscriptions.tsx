import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from "@tanstack/react-query";
import { staffAssignmentQuery, outletOrdersQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";
import { naira, planLabel, tierLabel, formatDate } from "@/lib/format";
import { StatusBadge, EmptyState } from "@/components/bits";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/outlet/subscriptions")({
  component: OutletSubscriptions,
  head: () => ({ meta: [{"title": "Subscriptions — Campus Delight"}, {"name": "description", "content": "View and manage subscriptions in your Campus Delight account."}, {"property": "og:title", "content": "Subscriptions — Campus Delight"}, {"property": "og:description", "content": "View and manage subscriptions in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

const outletSubsQuery = (outletId: string) =>
  queryOptions({
    queryKey: ["outlet", outletId, "subs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, customer:profiles(full_name, customer_code)")
        .eq("outlet_id", outletId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

function OutletSubscriptions() {
  const { data: assignment } = useSuspenseQuery(staffAssignmentQuery);
  const { data: subs } = useSuspenseQuery(outletSubsQuery(assignment?.outlet_id ?? ""));

  if (subs.length === 0) {
    return <EmptyState title="No subscriptions yet" hint="Customer subscriptions sold at your outlet appear here." />;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subs.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="text-xs">
                  <p className="font-medium">{s.customer?.full_name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{s.customer?.customer_code}</p>
                </TableCell>
                <TableCell className="text-xs">{planLabel(s.plan)} · {tierLabel(s.tier)}</TableCell>
                <TableCell className="text-xs">{s.start_date ? `${formatDate(s.start_date)} → ${formatDate(s.end_date)}` : "—"}</TableCell>
                <TableCell className="text-right text-xs">{naira(s.price_kobo)}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
