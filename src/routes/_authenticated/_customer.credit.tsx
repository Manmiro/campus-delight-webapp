import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, Timer, Loader2 } from "lucide-react";
import { requestOtp } from "@/lib/credit.functions";
import { profileQuery, creditQuery, loansQuery, creditHistoryQuery } from "@/lib/queries";
import { naira, formatDateTime, statusLabel } from "@/lib/format";
import { DEFAULT_CREDIT_LIMIT_KOBO } from "@/lib/prd-rules";
import { StatCard, EmptyState, StatusBadge } from "@/components/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_customer/credit")({
  component: CreditPage,
  head: () => ({ meta: [{ title: "Eat Now & Pay Later — Campus Delight" }] }),
});

function CreditPage() {
  const qc = useQueryClient();
  const askOtp = useServerFn(requestOtp);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: credit } = useSuspenseQuery(creditQuery);
  const { data: loans } = useSuspenseQuery(loansQuery);
  const { data: history } = useSuspenseQuery(creditHistoryQuery);

  const [otp, setOtp] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [sending, setSending] = useState(false);

  const waitEnd = new Date(new Date(profile.created_at).getTime() + 24 * 3600 * 1000);
  const hoursLeft = Math.max(0, Math.ceil((waitEnd.getTime() - Date.now()) / 3600000));
  const verified = profile.verification_status === "verified";
  const eligible = hoursLeft === 0 && verified;
  const openLoan = loans.find((l) => ["active", "partially_repaid", "overdue"].includes(l.status));
  const available = (credit?.credit_limit_kobo ?? DEFAULT_CREDIT_LIMIT_KOBO) - (credit?.outstanding_kobo ?? 0);

  const request = useMutation({
    mutationFn: async () => {
      setSending(true);
      const code = await askOtp();
      setDemoCode(code); // Demo delivery: shown here until an SMS gateway is connected.
    },
    onSettled: () => setSending(false),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send code"),
  });

  const verify = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("verify_otp", { p_code: otp });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Phone verified! Eat Now & Pay Later is unlocked.");
      setOtp("");
      setDemoCode("");
      void qc.invalidateQueries({ queryKey: ["me", "profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Verification failed"),
  });

  const repay = useMutation({
    mutationFn: async ({ loanId, amountKobo }: { loanId: string; amountKobo: number }) => {
      const { error } = await supabase.rpc("repay_loan", { p_loan_id: loanId, p_amount_kobo: amountKobo });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Repayment applied.");
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Repayment failed"),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Credit limit" value={naira(credit?.credit_limit_kobo ?? DEFAULT_CREDIT_LIMIT_KOBO)} hint="Doubles when you repay on time · −30% when late" />
        <StatCard label="Available to borrow" value={naira(available)} hint="Maximum principal for your next loan" />
        <StatCard label="Outstanding" value={naira(credit?.outstanding_kobo ?? 0)} hint="Existing debt stays payable no matter what" />
      </div>

      {!eligible && (
        <Card className="border-golden/40 bg-accent/50">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">
                <Timer className="mr-1.5 inline h-4 w-4" />
                {hoursLeft > 0 ? `Eat Now & Pay Later unlocks in ${hoursLeft}h after registration` : "Verify your phone number to unlock"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every customer waits 24 hours after registering, then verifies their phone with a 5-digit code.
              </p>
            </div>
            {hoursLeft === 0 && !verified && (
              <Button onClick={() => request.mutate()} disabled={sending || request.isPending}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Send code
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {hoursLeft === 0 && !verified && demoCode && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <Label>Enter the 5-digit code sent to {profile.phone}</Label>
            <InputOTP maxLength={5} value={otp} onChange={setOtp}>
              <InputOTPGroup>
                <InputOTPSlot index={0} /><InputOTPSeparator /><InputOTPSlot index={1} /><InputOTPSeparator />
                <InputOTPSlot index={2} /><InputOTPSeparator /><InputOTPSlot index={3} /><InputOTPSeparator /><InputOTPSlot index={4} />
              </InputOTPGroup>
            </InputOTP>
            <div className="flex items-center gap-3">
              <Button onClick={() => verify.mutate()} disabled={otp.length !== 5 || verify.isPending}>Verify</Button>
              <Button variant="ghost" onClick={() => request.mutate()} disabled={sending}>Resend</Button>
            </div>
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Demo delivery (no SMS gateway connected yet): your code is <span className="font-mono font-bold text-foreground">{demoCode}</span>. It expires in 5 minutes.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-lg">Your loans</CardTitle>
        </CardHeader>
        <CardContent>
          {loans.length === 0 ? (
            <EmptyState title="No loans yet" hint="Order eligible items with Eat Now & Pay Later — terms of 7, 14 or 30 days.">
              <Button asChild size="sm"><Link to="/order">Order food</Link></Button>
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {loans.slice(0, 6).map((l) => (
                <Card key={l.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold">{l.item_summary ?? "Food order"}</p>
                      <p className="text-xs text-muted-foreground">
                        Borrowed {naira(l.principal_kobo)} · {l.term_days}-day term · due {formatDateTime(l.due_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={l.status} />
                      {["active", "partially_repaid", "overdue"].includes(l.status) && (
                        <Button size="sm" variant="outline" asChild>
                          <Link to="/repayments">Repay</Link>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Credit-limit history</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your limit changes appear here — every adjustment is recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Adjustment</TableHead>
                  <TableHead className="text-right">Before</TableHead>
                  <TableHead className="text-right">After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs">{formatDateTime(h.created_at)}</TableCell>
                    <TableCell className="text-xs">{statusLabel(h.adjustment_type)}{h.notes ? ` — ${h.notes}` : ""}</TableCell>
                    <TableCell className="text-right text-xs">{naira(h.previous_limit_kobo)}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{naira(h.new_limit_kobo)}</TableCell>
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
