import { createFileRoute } from '@tanstack/react-router'
import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { applyOutletTransfer } from "@/lib/transactions.functions";
import { toast } from "sonner";
import { profileQuery, transferApplicationsQuery, walletQuery, tokenAccountQuery } from "@/lib/queries";
import { naira, formatDateTime, tokens as fmtTokens } from "@/lib/format";
import { EmptyState, StatusBadge, PageLoader } from "@/components/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_customer/transfer-outlet")({
  component: TransferOutletPage,
  head: () => ({ meta: [{"title": "Transfer Outlet — Campus Delight"}, {"name": "description", "content": "View and manage transfer outlet in your Campus Delight account."}, {"property": "og:title", "content": "Transfer Outlet — Campus Delight"}, {"property": "og:description", "content": "View and manage transfer outlet in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

const listAllOutlets = createServerFn({ method: "GET" }).handler(async () => {
  const { listOutlets } = await import("@/lib/catalog.functions");
  return listOutlets();
});

function TransferOutletPage() {
  const qc = useQueryClient();
  const submitTransfer = useServerFn(applyOutletTransfer);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: apps } = useSuspenseQuery(transferApplicationsQuery);
  const { data: wallet } = useSuspenseQuery(walletQuery);
  const { data: tk } = useSuspenseQuery(tokenAccountQuery);
  const { data: outlets, isLoading } = useQuery({ queryKey: ["all-outlets"], queryFn: listAllOutlets });

  const [toOutlet, setToOutlet] = useState("");
  const [feeMethod, setFeeMethod] = useState("");

  const apply = useMutation({
    mutationFn: async () => {
      if (!toOutlet || !feeMethod) throw new Error("Choose a destination outlet and a payment method");
      await submitTransfer({ data: { outletId: toOutlet, feeMethod } });
    },
    onSuccess: () => {
      toast.success("Application submitted — headquarters will review it.");
      void qc.invalidateQueries({ queryKey: ["me", "transfer-applications"] });
      void qc.invalidateQueries({ queryKey: ["me", "wallet"] });
      void qc.invalidateQueries({ queryKey: ["me", "tokens"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Application failed"),
  });

  const thisMonth = apps.filter(
    (a) => new Date(a.created_at).getMonth() === new Date().getMonth() && a.status !== "withdrawn",
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Apply to move outlets</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-accent/70 p-3 text-sm text-accent-foreground">
            <ul className="list-inside list-disc space-y-1 text-xs">
              <li>Fee: ₦500 cash or 500 tokens — one method only, never both.</li>
              <li>One application per calendar month.</li>
              <li>The fee is non-refundable once submitted, and paying it does not guarantee approval.</li>
              <li>Your customer ID, balances and history stay with you; only your outlet changes after approval.</li>
            </ul>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Destination outlet</Label>
              <Select value={toOutlet} onValueChange={setToOutlet}>
                <SelectTrigger className="mt-1 w-full"><SelectValue placeholder={isLoading ? "Loading…" : "Choose outlet"} /></SelectTrigger>
                <SelectContent>
                  {(outlets ?? []).filter((o) => o.id !== profile.outlet_id).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pay fee with</Label>
              <Select value={feeMethod} onValueChange={setFeeMethod}>
                <SelectTrigger className="mt-1 w-full"><SelectValue placeholder="Cash or tokens" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash" disabled={(wallet?.balance_kobo ?? 0) < 50000}>Cash — {naira(wallet?.balance_kobo)} available</SelectItem>
                  <SelectItem value="tokens" disabled={(tk?.available_tokens ?? 0) < 500}>Tokens — {fmtTokens(tk?.available_tokens)} available</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button disabled={thisMonth.length > 0 || apply.isPending} onClick={() => apply.mutate()}>
            {thisMonth.length > 0 ? "Already applied this month" : "Submit application & pay fee"}
          </Button>
        </CardContent>
      </Card>

      {apps.length === 0 ? (
        <EmptyState title="No applications yet" />
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{a.from_outlet?.name} → {a.to_outlet?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(a.created_at)} · fee {a.fee_method === "cash" ? naira(a.fee_amount) : `${fmtTokens(a.fee_amount)} tokens`} · ref {a.reference}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
