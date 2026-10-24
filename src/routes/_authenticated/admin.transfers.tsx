import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { adminDecideTransfer } from "@/lib/admin.functions";
import { naira, tokens as fmtTokens, formatDateTime } from "@/lib/format";
import { EmptyState, StatusBadge } from "@/components/bits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/transfers")({
  component: AdminTransfers,
  head: () => ({ meta: [{ title: "Outlet Transfers — Campus Delight HQ" }] }),
});

function AdminTransfers() {
  const qc = useQueryClient();
  const decide = useServerFn(adminDecideTransfer);

  const { data: apps } = useQuery({
    queryKey: ["admin", "transfer-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outlet_transfer_applications")
        .select("*, customer:profiles(full_name, customer_code), from_outlet:outlets!outlet_transfer_applications_from_outlet_id_fkey(name), to_outlet:outlets!outlet_transfer_applications_to_outlet_id_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const act = useMutation({
    mutationFn: (input: { applicationId: string; approve: boolean }) => decide({ data: input }),
    onSuccess: () => {
      toast.success("Decision recorded and the customer was notified");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Decision failed"),
  });

  if ((apps ?? []).length === 0) {
    return <EmptyState title="No transfer applications yet" hint="Customer applications awaiting headquarters review appear here." />;
  }

  return (
    <div className="space-y-3">
      {(apps ?? []).map((a) => (
        <Card key={a.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">{a.customer?.full_name} <span className="font-mono text-xs text-muted-foreground">{a.customer?.customer_code}</span></p>
              <p className="text-sm">{a.from_outlet?.name} → <span className="font-semibold text-primary">{a.to_outlet?.name}</span></p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(a.created_at)} · fee {a.fee_method === "cash" ? naira(a.fee_amount) : `${fmtTokens(a.fee_amount)} tokens`} · ref {a.reference}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={a.status} />
              {(a.status === "submitted" || a.status === "under_review") && (
                <>
                  <Button size="sm" onClick={() => act.mutate({ applicationId: a.id, approve: true })}>Approve &amp; transfer</Button>
                  <Button size="sm" variant="outline" onClick={() => act.mutate({ applicationId: a.id, approve: false })}>Reject</Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
