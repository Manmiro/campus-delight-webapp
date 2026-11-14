import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { adjustFoodCredit } from "@/lib/transactions.functions";
import { adminRestoreLoanAccess } from "@/lib/admin.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { showFoodieError } from "@/lib/foodie-errors";
import { naira, formatDateTime } from "@/lib/format";
import { StatCard, EmptyState, StatusBadge } from "@/components/bits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/credit")({
  component: AdminCredit,
  head: () => ({ meta: [{"title": "Eat Now & Pay Later — Campus Delight HQ"}, {"name": "description", "content": "View and manage eat now & pay later in your Campus Delight account."}, {"property": "og:title", "content": "Eat Now & Pay Later — Campus Delight HQ"}, {"property": "og:description", "content": "View and manage eat now & pay later in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

function AdminCredit() {
  const qc = useQueryClient();
  const submitAdjustment = useServerFn(adjustFoodCredit);
  const restoreAccess = useServerFn(adminRestoreLoanAccess);
  const [access, setAccess] = useState<{ loanId: string; name: string; orderingRestored: boolean; transfersRestored: boolean; reason: string } | null>(null);
  const { data: exceptions } = useQuery({ queryKey: ["admin", "loan-exceptions"], queryFn: async () => {
    const { data, error } = await supabase.from("loan_restriction_exceptions").select("*");
    if (error) throw new Error(error.message);
    return data ?? [];
  } });
  const saveAccess = useMutation({ mutationFn: async () => {
    if (!access) throw new Error("Choose a loan");
    return restoreAccess({ data: access });
  }, onSuccess: () => { toast.success("Loan access updated — debt and charges are unchanged"); setAccess(null); void qc.invalidateQueries({ queryKey: ["admin"] }); void qc.invalidateQueries({ queryKey: ["me"] }); }, onError: (e) => showFoodieError(e, "Could not update access") });
  const [adjust, setAdjust] = useState<{ customerId: string; name: string; current: number; value: string; reason: string } | null>(null);

  const { data: loans } = useQuery({
    queryKey: ["admin", "loans-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("*, customer:profiles(full_name, customer_code)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: credits } = useQuery({
    queryKey: ["admin", "credit-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_credit")
        .select("*, customer:profiles(full_name, customer_code)")
        .limit(300);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const adjustLimit = useMutation({
    mutationFn: async () => {
      if (!adjust) throw new Error("Nothing to adjust");
      await submitAdjustment({ data: { customerId: adjust.customerId, newLimitKobo: Math.round(Number(adjust.value) * 100), reason: adjust.reason } });
    },
    onSuccess: () => {
      toast.success("Credit limit adjusted — the change is audited");
      setAdjust(null);
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => showFoodieError(e, "Adjustment failed"),
  });

  const outstanding = (loans ?? []).filter((l) => ["active", "partially_repaid", "overdue"].includes(l.status)).reduce((a, l) => a + l.total_due_kobo, 0);
  const overdueCount = (loans ?? []).filter((l) => l.status === "overdue").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding (total due)" value={naira(outstanding)} />
        <StatCard label="Overdue loans" value={overdueCount} />
        <StatCard label="Credit accounts" value={(credits ?? []).length} />
      </div>

      <Dialog open={access !== null} onOpenChange={(open) => { if (!open && !saveAccess.isPending) setAccess(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Restore access — {access?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Applies to this loan only. Debt, daily charges and the restriction on new overdue borrowing remain. Other overdue loans may still restrict this customer.</p>
          <Label className="flex items-center gap-3"><Checkbox checked={access?.orderingRestored ?? false} onCheckedChange={(v) => setAccess((a) => a ? { ...a, orderingRestored: v === true } : a)} />Unpause ordering</Label>
          <Label className="flex items-center gap-3"><Checkbox checked={access?.transfersRestored ?? false} onCheckedChange={(v) => setAccess((a) => a ? { ...a, transfersRestored: v === true } : a)} />Unfreeze token transfers</Label>
          <Label htmlFor="access-reason">Reason</Label><Input id="access-reason" value={access?.reason ?? ""} onChange={(e) => setAccess((a) => a ? { ...a, reason: e.target.value } : a)} maxLength={500} />
          <Button disabled={!access?.reason.trim() || saveAccess.isPending} onClick={() => saveAccess.mutate()}>{saveAccess.isPending ? "Saving…" : "Save access"}</Button>
        </DialogContent>
      </Dialog>
      {(loans ?? []).length === 0 ? (
        <EmptyState title="No loans yet" hint="Borrowing activity across all outlets appears here." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Principal</TableHead>
                  <TableHead className="text-right">Total due</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ordering & transfers</TableHead>
                  <TableHead className="text-right">Adjust limit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(loans ?? []).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{formatDateTime(l.created_at)}</TableCell>
                    <TableCell className="text-xs">
                      <p className="font-medium">{l.customer?.full_name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{l.customer?.customer_code}</p>
                    </TableCell>
                    <TableCell className="text-xs">{naira(l.principal_kobo)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{naira(l.total_due_kobo)}</TableCell>
                    <TableCell className="text-xs">{l.term_days}d</TableCell>
                    <TableCell className="text-xs">{formatDateTime(l.due_at)}</TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                    <TableCell>
                      {["active", "partially_repaid", "overdue"].includes(l.status) && <Button size="sm" variant="outline" onClick={() => {
                        const e = exceptions?.find((e) => e.loan_id === l.id);
                        setAccess({ loanId: l.id, name: l.customer?.full_name ?? "Customer", orderingRestored: e?.ordering_restored ?? false, transfersRestored: e?.transfers_restored ?? false, reason: "" });
                      }}>Manage access</Button>}
                    </TableCell>
                    <TableCell className="text-right">
                      {credits?.some((c) => c.customer?.customer_code === l.customer?.customer_code) ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => {
                              const acct = credits?.find((c) => c.customer_id === l.customer_id);
                              setAdjust({
                                customerId: l.customer_id,
                                name: l.customer?.full_name ?? "",
                                current: acct?.credit_limit_kobo ?? 0,
                                value: String((acct?.credit_limit_kobo ?? 0) / 100),
                                reason: "",
                              });
                            }}>Adjust</Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Adjust credit limit — {adjust?.name}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                              <p className="text-sm text-muted-foreground">Current limit: <span className="font-semibold text-foreground">{naira(adjust?.current ?? 0)}</span>. A reason is mandatory and recorded in the audit log.</p>
                              <div>
                                <Label>New limit (₦)</Label>
                                <Input value={adjust?.value ?? ""} inputMode="decimal" onChange={(e) => setAdjust((a) => (a ? { ...a, value: e.target.value } : a))} />
                              </div>
                              <div>
                                <Label>Reason</Label>
                                <Input value={adjust?.reason ?? ""} onChange={(e) => setAdjust((a) => (a ? { ...a, reason: e.target.value } : a))} placeholder="e.g. verified dispute resolution" />
                              </div>
                              <Button className="w-full" disabled={!adjust?.value || !adjust.reason || adjustLimit.isPending} onClick={() => adjustLimit.mutate()}>Save adjustment</Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
