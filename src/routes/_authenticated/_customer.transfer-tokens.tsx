import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { transferTokens } from "@/lib/transactions.functions";
import { toast } from "sonner";
import { tokenAccountQuery, tokenTransfersQuery, profileQuery } from "@/lib/queries";
import { tokens as fmtTokens, formatDateTime } from "@/lib/format";
import {
  TOKEN_TRANSFER_DAILY_CAP_TOKENS,
  TOKEN_TRANSFER_FEE_TOKENS,
  remainingTransferAllowanceToday,
  transferTotalCostTokens,
} from "@/lib/prd-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_customer/transfer-tokens")({
  component: TransferTokensPage,
  head: () => ({ meta: [{"title": "Transfer Tokens — Campus Delight"}, {"name": "description", "content": "View and manage transfer tokens in your Campus Delight account."}, {"property": "og:title", "content": "Transfer Tokens — Campus Delight"}, {"property": "og:description", "content": "View and manage transfer tokens in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

function TransferTokensPage() {
  const qc = useQueryClient();
  const transfer = useServerFn(transferTokens);
  const { data: me } = useSuspenseQuery(profileQuery);
  const { data: tk } = useSuspenseQuery(tokenAccountQuery);
  const { data: history } = useSuspenseQuery(tokenTransfersQuery);
  const [identifier, setIdentifier] = useState("");
  const [amount, setAmount] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      await transfer({ data: { identifier: identifier.trim(), principal: Number(amount) } });
    },
    onSuccess: () => {
      toast.success("Transfer complete.");
      setIdentifier("");
      setAmount("");
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Transfer failed"),
  });

  const amountNum = Number(amount) || 0;
  const sentToday = history
    .filter((t) => t.sender_id === me.id && t.status === "success" && new Date(t.created_at).toDateString() === new Date().toDateString())
    .reduce((a, t) => a + t.principal_tokens, 0);
  const remainingToday = remainingTransferAllowanceToday(sentToday);

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <Card className="h-fit">
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Send tokens</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-secondary/60 p-3 text-sm text-secondary-foreground">
            <p className="font-semibold">Available: {fmtTokens(tk?.available_tokens)}</p>
            <p className="mt-0.5 text-xs">Same-outlet customers only · {TOKEN_TRANSFER_DAILY_CAP_TOKENS}-token daily principal limit · {TOKEN_TRANSFER_FEE_TOKENS}-token fee per transfer</p>
          </div>
          <div>
            <Label htmlFor="recipient">Recipient customer ID or email</Label>
            <Input id="recipient" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="CD482901 or friend@email.com" />
          </div>
          <div>
            <Label htmlFor="amount">Amount (tokens)</Label>
            <Input id="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="200" />
            {amountNum > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                They receive {fmtTokens(amountNum)} · you pay {fmtTokens(transferTotalCostTokens(amountNum))} (incl. {TOKEN_TRANSFER_FEE_TOKENS} fee)
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">You can still transfer {fmtTokens(remainingToday)} today.</p>
          <Button className="w-full" disabled={!identifier || amountNum <= 0 || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? "Sending…" : "Send tokens"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Transfer history</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transfers yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((t) => {
                  const outgoing = t.sender_id === me.id;
                  const counterparty = outgoing ? t.recipient?.full_name : t.sender?.full_name;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap text-xs">{formatDateTime(t.created_at)}</TableCell>
                      <TableCell className="text-xs">{outgoing ? "Sent" : "Received"}</TableCell>
                      <TableCell className="text-xs">{counterparty ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{fmtTokens(t.principal_tokens)}</TableCell>
                      <TableCell className="text-right text-xs">{outgoing ? fmtTokens(t.fee_tokens) : "—"}</TableCell>
                      <TableCell className="font-mono text-[11px]">{t.reference}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
