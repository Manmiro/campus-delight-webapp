import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { naira, formatDateTime } from "@/lib/format";
import { StatCard, EmptyState, StatusBadge } from "@/components/bits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/credit")({
  component: AdminCredit,
  head: () => ({ meta: [{ title: "Eat Now & Pay Later — Campus Delight HQ" }] }),
});

function AdminCredit() {
  const qc = useQueryClient();
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
      const { error } = await supabase.rpc("admin_adjust_credit_limit", {
        p_customer: adjust.customerId,
        p_new_limit_kobo: Math.round(Number(adjust.value) * 100),
        p_reason: adjust.reason,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Credit limit adjusted — the change is audited");
      setAdjust(null);
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Adjustment failed"),
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
                    <TableCell className="text-right">
                      {credits?.some((c) => c.customer?.customer_code === l.customer?.customer_code) ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => {
                              const acct = credits!.find((c) => c.customer?.customer_code === l.customer?.customer_code);
                              setAdjust({
                                customerId: (acct?.customer_id ?? l.customer?.customer_code) as string,
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

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
