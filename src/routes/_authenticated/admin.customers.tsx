import { useState } from "react";
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { adminAdjustBalances, adminSetAccountStatus } from "@/lib/admin.functions";
import { formatDate, naira, tokens as fmtTokens } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { deliverFile } from "@/lib/download";
import { customersCsv, customersCsvFilename } from "@/lib/customer-export";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: AdminCustomers,
  head: () => ({ meta: [{"title": "Customers — Campus Delight HQ"}, {"name": "description", "content": "View and manage customers in your Campus Delight account."}, {"property": "og:title", "content": "Customers — Campus Delight HQ"}, {"property": "og:description", "content": "View and manage customers in your Campus Delight account."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

type AdminCustomer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  customer_code: string;
  referral_code: string | null;
  verification_status: string | null;
  is_active: boolean;
  created_at: string;
  outlet: { name?: string } | null;
  wallet: { balance_kobo: number } | { balance_kobo: number }[] | null;
  tokens: { available_tokens: number; locked_tokens: number } | { available_tokens: number; locked_tokens: number }[] | null;
};

type AccountKind = "cash" | "tokens";
type AdjustmentDirection = "credit" | "debit";
type ManageState = {
  customer: AdminCustomer;
  account: AccountKind;
  direction: AdjustmentDirection;
  amount: string;
  reason: string;
};

function normalizeCode(raw: string) {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().replace(/^CD+/, "");
}

const CUSTOMER_FIELDS = "id, full_name, email, phone, customer_code, referral_code, verification_status, is_active, created_at, outlet:outlets(name), wallet:wallets(balance_kobo), tokens:token_accounts(available_tokens, locked_tokens)";

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function AdminCustomers() {
  const qc = useQueryClient();
  const submitAdjustment = useServerFn(adminAdjustBalances);
  const submitStatus = useServerFn(adminSetAccountStatus);
  const [search, setSearch] = useState("");
  const [manage, setManage] = useState<ManageState | null>(null);
  const digits = normalizeCode(search);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["admin", "customers", digits],
    queryFn: async () => {
      let q = supabase.from("profiles").select(CUSTOMER_FIELDS);
      if (digits) q = q.ilike("customer_code", `%CD${digits}%`).limit(50);
      else q = q.order("created_at", { ascending: false }).limit(300);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as AdminCustomer[];
    },
  });
  const rows = customers ?? [];
  const canExport = !isLoading && rows.length > 0;

  const adjustAccount = useMutation({
    mutationFn: async () => {
      if (!manage) throw new Error("Choose an account first");
      const amount = Number(manage.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero");
      const sign = manage.direction === "credit" ? 1 : -1;
      const cashDeltaKobo = manage.account === "cash" ? Math.round(amount * 100) * sign : 0;
      const tokenDelta = manage.account === "tokens" ? Math.floor(amount) * sign : 0;
      if (manage.account === "tokens" && (!Number.isSafeInteger(Number(manage.amount)) || tokenDelta === 0)) {
        throw new Error("Token adjustments must be whole tokens");
      }
      return submitAdjustment({
        data: {
          customerId: manage.customer.id,
          cashDeltaKobo,
          tokenDelta,
          reason: manage.reason,
          reference: `HQ-${crypto.randomUUID()}`,
        },
      });
    },
    onSuccess: () => {
      toast.success("Account balance adjusted and audited.");
      setManage(null);
      void qc.invalidateQueries({ queryKey: ["admin", "customers"] });
      void qc.invalidateQueries({ queryKey: ["admin", "audit-all"] });
      void qc.invalidateQueries({ queryKey: ["admin", "wallet-ledger"] });
      void qc.invalidateQueries({ queryKey: ["admin", "token-ledger"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Balance adjustment failed"),
  });

  const changeStatus = useMutation({
    mutationFn: async () => {
      if (!manage) throw new Error("Choose an account first");
      return submitStatus({
        data: {
          customerId: manage.customer.id,
          isActive: !manage.customer.is_active,
          reason: manage.reason,
        },
      });
    },
    onSuccess: () => {
      toast.success(manage?.customer.is_active ? "Account frozen." : "Account unfrozen.");
      setManage(null);
      void qc.invalidateQueries({ queryKey: ["admin", "customers"] });
      void qc.invalidateQueries({ queryKey: ["admin", "audit-all"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Account status update failed"),
  });

  function exportCsv() {
    if (!canExport) return;
    const blob = new Blob([customersCsv(rows)], { type: "text/csv;charset=utf-8" });
    void deliverFile(blob, customersCsvFilename());
    toast.success(`Exported ${rows.length} customer${rows.length === 1 ? "" : "s"} as CSV.`);
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Customers</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!canExport}
            className="w-full sm:w-auto"
          >
            Export CSV
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer ID, e.g. CD482901"
            className="font-mono text-xs sm:max-w-xs"
            inputMode="text"
            autoCapitalize="characters"
          />
          <p className="text-[11px] text-muted-foreground">
            The CSV covers the {rows.length} customer{rows.length === 1 ? "" : "s"} listed below.
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Balances</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(customers ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs">
                  <p className="font-medium">{c.full_name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{c.customer_code}</p>
                </TableCell>
                <TableCell className="text-xs">{c.phone ?? c.email ?? "—"}</TableCell>
                <TableCell className="text-xs">{(c.outlet as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  <p>{naira(firstRelation(c.wallet)?.balance_kobo ?? 0)}</p>
                  <p className="text-muted-foreground">{fmtTokens(firstRelation(c.tokens)?.available_tokens ?? 0)} tokens</p>
                </TableCell>
                <TableCell className="text-xs">{formatDate(c.created_at)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {c.is_active ? "Active" : "Inactive"}{c.verification_status === "verified" ? " · Verified" : ""}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setManage({ customer: c, account: "cash", direction: "credit", amount: "", reason: "" })}
                  >
                    Manage
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {digits && (customers ?? []).length === 0 && !isLoading && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No customer found for “{search.trim()}”.</TableCell></TableRow>
            )}
            {!digits && (customers ?? []).length === 0 && !isLoading && (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No customers yet.</TableCell></TableRow>
            )}
          </TableBody>
          </Table>
        </div>
      </CardContent>
      <Dialog open={Boolean(manage)} onOpenChange={(open) => { if (!open && !adjustAccount.isPending && !changeStatus.isPending) setManage(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage account — {manage?.customer.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-secondary/50 p-3 text-sm">
              <p className="font-semibold">{manage?.customer.customer_code}</p>
              <p className="mt-1 text-muted-foreground">Cash: {naira(firstRelation(manage?.customer.wallet)?.balance_kobo ?? 0)} · Tokens: {fmtTokens(firstRelation(manage?.customer.tokens)?.available_tokens ?? 0)}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="admin-account-type">Account</Label>
                <Select value={manage?.account ?? "cash"} onValueChange={(value) => setManage((current) => current ? { ...current, account: value as AccountKind } : current)}>
                  <SelectTrigger id="admin-account-type" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash wallet</SelectItem>
                    <SelectItem value="tokens">Available tokens</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="admin-adjustment-type">Action</Label>
                <Select value={manage?.direction ?? "credit"} onValueChange={(value) => setManage((current) => current ? { ...current, direction: value as AdjustmentDirection } : current)}>
                  <SelectTrigger id="admin-adjustment-type" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit / add</SelectItem>
                    <SelectItem value="debit">Debit / remove</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="admin-adjustment-amount">Amount {manage?.account === "cash" ? "(₦)" : "(whole tokens)"}</Label>
              <Input id="admin-adjustment-amount" className="mt-1" inputMode={manage?.account === "cash" ? "decimal" : "numeric"} value={manage?.amount ?? ""} onChange={(event) => setManage((current) => current ? { ...current, amount: event.target.value } : current)} placeholder={manage?.account === "cash" ? "e.g. 2000" : "e.g. 500"} />
            </div>
            <div>
              <Label htmlFor="admin-adjustment-reason">Reason</Label>
              <Input id="admin-adjustment-reason" className="mt-1" value={manage?.reason ?? ""} onChange={(event) => setManage((current) => current ? { ...current, reason: event.target.value } : current)} placeholder="Required audit note" maxLength={500} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" onClick={() => adjustAccount.mutate()} disabled={!manage?.amount || !manage.reason.trim() || adjustAccount.isPending || changeStatus.isPending}>
                {adjustAccount.isPending ? "Saving…" : "Save balance change"}
              </Button>
              <Button type="button" variant={manage?.customer.is_active ? "destructive" : "outline"} onClick={() => changeStatus.mutate()} disabled={!manage?.reason.trim() || adjustAccount.isPending || changeStatus.isPending}>
                {changeStatus.isPending ? "Saving…" : manage?.customer.is_active ? "Freeze account" : "Unfreeze account"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Every balance and status change is executed by a Headquarters-only database operation and recorded in Audit Logs.</p>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
