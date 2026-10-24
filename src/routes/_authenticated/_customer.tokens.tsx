import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { tokenAccountQuery, tokenLedgerQuery } from "@/lib/queries";
import { tokens as fmtTokens, formatDateTime } from "@/lib/format";
import { StatCard } from "@/components/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_customer/tokens")({
  component: TokensPage,
  head: () => ({ meta: [{"title": "Tokens — Campus Delight"}, {"name": "description", "content": "View and manage tokens in your Campus Delight account."}, {"property": "og:title", "content": "Tokens — Campus Delight"}, {"property": "og:description", "content": "View and manage tokens in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

function TokensPage() {
  const { data: tk } = useSuspenseQuery(tokenAccountQuery);
  const { data: ledger } = useSuspenseQuery(tokenLedgerQuery);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Available tokens" value={fmtTokens(tk?.available_tokens)} hint="1 token = ₦1 nominal value" />
        <StatCard label="Locked tokens" value={fmtTokens(tk?.locked_tokens)} hint="Locked referral rewards unlock after your referral's first order" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild><Link to="/transfer-tokens">Transfer tokens</Link></Button>
        <Button asChild variant="outline"><Link to="/refer">Refer &amp; earn</Link></Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Token ledger</CardTitle></CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No token activity yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Available after</TableHead>
                  <TableHead className="text-right">Locked after</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</TableCell>
                    <TableCell className="text-xs capitalize">{row.tx_type.replace("_", " ")}</TableCell>
                    <TableCell className="font-mono text-[11px]">{row.reference}</TableCell>
                    <TableCell className="text-right text-xs">{fmtTokens(row.available_after)}</TableCell>
                    <TableCell className="text-right text-xs">{fmtTokens(row.locked_after)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
