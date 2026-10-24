import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from "@tanstack/react-query";
import { staffAssignmentQuery, outletCustomersQuery } from "@/lib/queries";
import { naira, tokens as fmtTokens, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/bits";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/outlet/customers")({
  component: OutletCustomers,
  head: () => ({ meta: [{"title": "Customers — Campus Delight"}, {"name": "description", "content": "View and manage customers in your Campus Delight account."}, {"property": "og:title", "content": "Customers — Campus Delight"}, {"property": "og:description", "content": "View and manage customers in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

function OutletCustomers() {
  const { data: assignment } = useSuspenseQuery(staffAssignmentQuery);
  const { data: customers } = useSuspenseQuery(outletCustomersQuery(assignment?.outlet_id ?? ""));

  if (customers.length === 0) {
    return <EmptyState title="No customers yet" hint="Customers who register with your outlet appear here." />;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Wallet</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs">
                  <p className="font-medium">{c.full_name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{c.customer_code}</p>
                </TableCell>
                <TableCell className="text-xs">{c.phone ?? c.email ?? "—"}</TableCell>
                <TableCell className="text-right text-xs">{naira((c.wallets as { balance_kobo?: number } | null)?.balance_kobo ?? 0)}</TableCell>
                <TableCell className="text-right text-xs">{fmtTokens((c.token_accounts as { available_tokens?: number } | null)?.available_tokens ?? 0)}</TableCell>
                <TableCell className="text-xs">{formatDate(c.created_at)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {c.is_active ? "Active" : "Inactive"}{c.verification_status === "verified" ? " · Verified" : ""}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
