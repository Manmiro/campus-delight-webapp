import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ordersQuery, walletLedgerQuery, tokenLedgerQuery, profileQuery } from "@/lib/queries";
import { naira, tokens as fmtTokens, formatDateTime, statusLabel } from "@/lib/format";
import { StatusBadge, EmptyState } from "@/components/bits";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_customer/history")({
  component: HistoryPage,
  head: () => ({ meta: [{"title": "Transaction History — Campus Delight"}, {"name": "description", "content": "View and manage transaction history in your Campus Delight account."}, {"property": "og:title", "content": "Transaction History — Campus Delight"}, {"property": "og:description", "content": "View and manage transaction history in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

function HistoryPage() {
  const { data: orders } = useSuspenseQuery(ordersQuery);
  const { data: wl } = useSuspenseQuery(walletLedgerQuery);
  const { data: tl } = useSuspenseQuery(tokenLedgerQuery);

  return (
    <Tabs defaultValue="orders">
      <TabsList>
        <TabsTrigger value="orders">Orders</TabsTrigger>
        <TabsTrigger value="wallet">Wallet</TabsTrigger>
        <TabsTrigger value="tokens">Tokens</TabsTrigger>
      </TabsList>
      <TabsContent value="orders" className="mt-4">
        {orders.length === 0 ? (
          <EmptyState title="No orders yet" />
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <Card key={o.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{o.reference}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(o.created_at)} · paid by {o.payment_method.replace("_", " ")}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold">{o.total_kobo === 0 ? "Entitlement" : naira(o.total_kobo)}</p>
                      <StatusBadge status={o.status} />
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {o.order_items.map((i: { id: string; item_name: string; quantity: number; unit_price_kobo: number }) => (
                      <li key={i.id} className="flex justify-between">
                        <span>{i.item_name} ×{i.quantity}</span>
                        <span>{naira(i.unit_price_kobo * i.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>
      <TabsContent value="wallet" className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wl.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                <TableCell className="text-xs capitalize">{r.tx_type}</TableCell>
                <TableCell className="font-mono text-[11px]">{r.reference}</TableCell>
                <TableCell className={`text-right text-xs font-semibold ${r.amount_kobo < 0 ? "text-destructive" : "text-primary"}`}>{naira(r.amount_kobo)}</TableCell>
                <TableCell className="text-right text-xs">{naira(r.balance_after_kobo)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TabsContent>
      <TabsContent value="tokens" className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tl.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                <TableCell className="text-xs capitalize">{r.tx_type.replace("_", " ")}</TableCell>
                <TableCell className="font-mono text-[11px]">{r.reference}</TableCell>
                <TableCell className="text-right text-xs font-semibold">{fmtTokens(r.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TabsContent>
    </Tabs>
  );
}
