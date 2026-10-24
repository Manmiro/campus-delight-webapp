import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loansQuery, repaymentsQuery, walletQuery } from "@/lib/queries";
import { naira, formatDateTime } from "@/lib/format";
import { EmptyState, StatusBadge } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_customer/repayments")({
  component: RepaymentsPage,
  head: () => ({ meta: [{ title: "Loan Repayments — Campus Delight" }] }),
});

function RepaymentsPage() {
  const qc = useQueryClient();
  const { data: loans } = useSuspenseQuery(loansQuery);
  const { data: repayments } = useSuspenseQuery(repaymentsQuery);
  const { data: wallet } = useSuspenseQuery(walletQuery);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const openLoans = loans.filter((l) => ["active", "partially_repaid", "overdue"].includes(l.status));

  const repay = useMutation({
    mutationFn: async ({ loanId, amountKobo }: { loanId: string; amountKobo: number }) => {
      const { error } = await supabase.rpc("repay_loan", { p_loan_id: loanId, p_amount_kobo: amountKobo });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Repayment applied.");
      setAmounts({});
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Repayment failed"),
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Part-pay any amount into an open loan — the outstanding balance recalculates after every successful payment.
        Settle fully by the deadline and your credit limit doubles.
      </p>

      {openLoans.length === 0 ? (
        <EmptyState title="Nothing to repay" hint="You have no open loans. Borrow anytime from Order Food with Eat Now & Pay Later." />
      ) : (
        <div className="space-y-3">
          {openLoans.map((l) => {
            const outstanding = Math.max(0, l.total_due_kobo + l.overdue_kobo);
            return (
              <Card key={l.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{l.item_summary ?? "Food order"}</p>
                      <p className="text-xs text-muted-foreground">
                        Borrowed {naira(l.principal_kobo)} + charge {naira(l.charge_kobo)} = {naira(l.total_due_kobo)} · due {formatDateTime(l.due_at)}
                      </p>
                    </div>
                    <StatusBadge status={l.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div className="w-40">
                      <Input
                        inputMode="numeric"
                        placeholder="Amount (₦)"
                        value={amounts[l.id] ?? ""}
                        onChange={(e) => setAmounts((a) => ({ ...a, [l.id]: e.target.value }))}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={(wallet?.balance_kobo ?? 0) < outstanding}
                      onClick={() => repay.mutate({ loanId: l.id, amountKobo: outstanding })}
                    >
                      Pay full {naira(outstanding)}
                    </Button>
                    <Button
                      size="sm"
                      disabled={!amounts[l.id] || Number(amounts[l.id]) <= 0 || repay.isPending}
                      onClick={() => repay.mutate({ loanId: l.id, amountKobo: Math.round(Number(amounts[l.id]) * 100) })}
                    >
                      Pay part
                    </Button>
                    <p className="text-xs text-muted-foreground">Wallet balance: {naira(wallet?.balance_kobo)}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Repayment history</CardTitle></CardHeader>
        <CardContent>
          {repayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No repayments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repayments.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                    <TableCell className="font-mono text-[11px]">{r.reference}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{naira(r.amount_kobo)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
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
