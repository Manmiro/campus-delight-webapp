import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { naira, tokens as fmtTokens, formatDateTime } from "@/lib/format";
import { EmptyState, StatCard } from "@/components/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/financial")({
  component: AdminFinancial,
  head: () => ({ meta: [{"title": "Financial Oversight — Campus Delight HQ"}, {"name": "description", "content": "View and manage financial oversight in your Campus Delight account."}, {"property": "og:title", "content": "Financial Oversight — Campus Delight HQ"}, {"property": "og:description", "content": "View and manage financial oversight in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

function AdminFinancial() {
  const [tab, setTab] = useState("wallet");
  const { data: wl } = useQuery({
    queryKey: ["admin", "wallet-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_ledger")
        .select("*, customer:profiles(full_name, customer_code)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const { data: tl } = useQuery({
    queryKey: ["admin", "token-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("token_ledger")
        .select("*, customer:profiles(full_name, customer_code)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const { data: tx } = useQuery({
    queryKey: ["admin", "payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("*, customer:profiles(full_name, customer_code)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const { data: transfers } = useQuery({
    queryKey: ["admin", "token-transfers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("token_transfers")
        .select("*, sender:profiles!token_transfers_sender_id_fkey(full_name, customer_code), recipient:profiles!token_transfers_recipient_id_fkey(full_name, customer_code)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const funded = (wl ?? []).filter((r) => r["tx_type"] === "funding").reduce((a, r) => a + r["amount_kobo"], 0);
  const feeTokens = (tl ?? []).filter((r) => r["tx_type"] === "transfer_fee").reduce((a, r) => a + r["amount"], 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Wallet funds raised" value={naira(funded)} hint="verified funding only" />
        <StatCard label="Transfer fees collected" value={fmtTokens(feeTokens)} hint="10 tokens per transfer" />
        <StatCard label="Gateway transactions" value={(tx ?? []).length} hint="wallet funding & subscriptions" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="wallet">Wallet ledger</TabsTrigger>
          <TabsTrigger value="tokens">Token ledger</TabsTrigger>
          <TabsTrigger value="payments">Gateway</TabsTrigger>
          <TabsTrigger value="transfers">Token transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="wallet" className="mt-4">
          <Card><CardContent className="p-0"><LedgerTable rows={wl ?? []} kind="wallet" /></CardContent></Card>
        </TabsContent>
        <TabsContent value="tokens" className="mt-4">
          <Card><CardContent className="p-0"><LedgerTable rows={tl ?? []} kind="token" /></CardContent></Card>
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <Card><CardContent className="p-0">
            {(tx ?? []).length === 0 ? <EmptyState title="No gateway transactions yet" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Purpose</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(tx ?? []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{formatDateTime(t.created_at)}</TableCell>
                      <TableCell className="text-xs">{t.customer?.full_name}</TableCell>
                      <TableCell className="text-xs capitalize">{t.purpose.replace("_", " ")}</TableCell>
                      <TableCell className="font-mono text-[11px]">{t.paystack_reference}</TableCell>
                      <TableCell className="text-right text-xs">{naira(t.amount_kobo)}</TableCell>
                      <TableCell className="text-xs capitalize">{t.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="transfers" className="mt-4">
          <Card><CardContent className="p-0">
            {(transfers ?? []).length === 0 ? <EmptyState title="No token transfers yet" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead className="text-right">Principal</TableHead><TableHead className="text-right">Fee</TableHead><TableHead>Reference</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(transfers ?? []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{formatDateTime(t.created_at)}</TableCell>
                      <TableCell className="text-xs">{t.sender?.full_name}</TableCell>
                      <TableCell className="text-xs">{t.recipient?.full_name}</TableCell>
                      <TableCell className="text-right text-xs">{fmtTokens(t.principal_tokens)}</TableCell>
                      <TableCell className="text-right text-xs">{fmtTokens(t.fee_tokens)}</TableCell>
                      <TableCell className="font-mono text-[11px]">{t.reference}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LedgerTable({ rows, kind }: { rows: Record<string, unknown>[]; kind: "wallet" | "token" }) {
  if (rows.length === 0) return <EmptyState title="No ledger activity yet" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead className="text-right">{kind === "wallet" ? "Amount" : "Tokens"}</TableHead>
          {kind === "wallet" && <TableHead className="text-right">Balance</TableHead>}
          {kind === "token" && <TableHead className="text-right">After (avail/locked)</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={String(r["id"])}>
            <TableCell className="text-xs">{formatDateTime(String(r["created_at"]))}</TableCell>
            <TableCell className="text-xs">{(r["customer"] as { full_name?: string } | null)?.full_name ?? "—"}</TableCell>
            <TableCell className="text-xs capitalize">{String(r["tx_type"]).replace("_", " ")}</TableCell>
            <TableCell className="font-mono text-[11px]">{String(r["reference"])}</TableCell>
            <TableCell className={`text-right text-xs font-semibold ${Number(kind === "wallet" ? r["amount_kobo"] : r["amount"]) < 0 ? "text-destructive" : "text-primary"}`}>
              {kind === "wallet" ? naira(Number(r["amount_kobo"])) : fmtTokens(Number(r["amount"]))}
            </TableCell>
            {kind === "wallet" && <TableCell className="text-right text-xs">{naira(Number(r["balance_after_kobo"]))}</TableCell>}
            {kind === "token" && <TableCell className="text-right text-xs">{fmtTokens(Number(r["available_after"]))} / {fmtTokens(Number(r["locked_after"]))}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
