import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { initializePayment } from "@/lib/payments.functions";
import { walletQuery, walletLedgerQuery, profileQuery } from "@/lib/queries";
import { naira, formatDateTime } from "@/lib/format";
import { StatCard, PageLoader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_customer/wallet")({
  component: WalletPage,
  head: () => ({ meta: [{ title: "Wallet — Campus Delight" }] }),
});

const PRESETS = [100000, 200000, 500000];

function WalletPage() {
  const qc = useQueryClient();
  const initPayment = useServerFn(initializePayment);
  const { data: wallet } = useSuspenseQuery(walletQuery);
  const { data: ledger } = useSuspenseQuery(walletLedgerQuery);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const [amount, setAmount] = useState("2000");

  const fund = useMutation({
    mutationFn: async (kobo: number) => {
      if (!kobo || kobo <= 0) throw new Error("Enter a valid amount");
      const result = await initPayment({ data: { purpose: "wallet_funding", amountKobo: kobo } });
      window.location.href = result.authorizationUrl;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start payment"),
  });

  if (!profile.outlet_id) {
    return <p className="text-sm text-muted-foreground">Your wallet is ready — funding unlocks once your outlet is assigned.</p>;
  }

  return (
    <div className="space-y-6">
      <StatCard label="Wallet balance" value={naira(wallet?.balance_kobo)} />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Fund your wallet</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button key={p} variant="outline" size="sm" onClick={() => setAmount(String(p / 100))}>{naira(p)}</Button>
            ))}
          </div>
          <div className="flex max-w-sm items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="amount">Amount (₦)</Label>
              <Input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <Button onClick={() => fund.mutate(Math.round(Number(amount) * 100))} disabled={fund.isPending}>
              {fund.isPending ? "Starting…" : "Fund with Paystack"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Only payments verified on our backend ever increase your balance.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Wallet ledger</CardTitle></CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No wallet activity yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</TableCell>
                    <TableCell className="text-xs capitalize">{row.tx_type}</TableCell>
                    <TableCell className="text-xs">{row.description}</TableCell>
                    <TableCell className={`text-right text-xs font-semibold ${row.amount_kobo < 0 ? "text-destructive" : "text-primary"}`}>
                      {naira(row.amount_kobo)}
                    </TableCell>
                    <TableCell className="text-right text-xs">{naira(row.balance_after_kobo)}</TableCell>
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
