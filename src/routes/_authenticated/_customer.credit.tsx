import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldCheck, Timer, Loader2, Sparkles, UtensilsCrossed, TrendingUp, Wallet, Receipt, Check, CalendarClock, History } from "lucide-react";
import { requestOtp } from "@/lib/credit.functions";
import { repayFoodLoan } from "@/lib/transactions.functions";
import { profileQuery, creditQuery, loansQuery, creditHistoryQuery } from "@/lib/queries";
import { naira, formatDateTime, statusLabel } from "@/lib/format";
import { DEFAULT_CREDIT_LIMIT_KOBO } from "@/lib/prd-rules";
import { EmptyState, StatusBadge } from "@/components/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";

export const Route = createFileRoute("/_authenticated/_customer/credit")({
  component: CreditPage,
  head: () => ({ meta: [{"title": "Eat Now & Pay Later — Campus Delight"}, {"name": "description", "content": "View your Campus Delight borrowing limit, verification status, loans and repayment history."}, {"property": "og:title", "content": "Eat Now & Pay Later — Campus Delight"}, {"property": "og:description", "content": "View your Campus Delight borrowing limit, verification status, loans and repayment history."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

function CreditPage() {
  const qc = useQueryClient();
  const askOtp = useServerFn(requestOtp);
  const submitRepayment = useServerFn(repayFoodLoan);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: credit } = useSuspenseQuery(creditQuery);
  const { data: loans } = useSuspenseQuery(loansQuery);
  const { data: history } = useSuspenseQuery(creditHistoryQuery);

  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
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
      await askOtp();
      setCodeSent(true);
      toast.success("Verification text requested. Check your phone.");
    },
    onSettled: () => setSending(false),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send code"),
  });

  const verify = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("verify_otp", { p_code: otp });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Code is incorrect, expired or no longer valid. Try again or request a new code.");
    },
    onSuccess: () => {
      toast.success("Phone verified! Eat Now & Pay Later is unlocked.");
      setOtp("");
      setCodeSent(false);
      void qc.invalidateQueries({ queryKey: ["me", "profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Verification failed"),
  });

  const repay = useMutation({
    mutationFn: async ({ loanId, amountKobo }: { loanId: string; amountKobo: number }) => {
      await submitRepayment({ data: { loanId, amountKobo } });
    },
    onSuccess: () => {
      toast.success("Repayment applied.");
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Repayment failed"),
  });

  const limitKobo = credit?.credit_limit_kobo ?? DEFAULT_CREDIT_LIMIT_KOBO;
  const usedPct = limitKobo > 0 ? Math.min(100, Math.round(((credit?.outstanding_kobo ?? 0) / limitKobo) * 100)) : 0;
  const availPct = 100 - usedPct;
  const unlockSteps = [
    { label: "Register", done: true },
    { label: "Wait 24 hours", done: hoursLeft === 0 },
    { label: "Verify phone", done: verified },
    { label: "Eat now!", done: eligible },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-brand p-5 text-primary-foreground shadow-glow sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-golden/30 blur-3xl" />
        <div className="relative grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-golden px-3 py-1 text-xs font-semibold text-golden-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Eat Now &amp; Pay Later
            </span>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
              {eligible ? "Hungry? You're good to go." : "Almost there — unlock your credit."}
            </h1>
            <p className="mt-2 max-w-lg text-sm opacity-90 sm:text-base">
              Eat today, repay in 7, 14 or 30 days. Repay on time and your limit doubles.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild variant="secondary" className="rounded-full">
                <Link to="/order"><UtensilsCrossed className="mr-2 h-4 w-4" /> Order on credit</Link>
              </Button>
              {openLoan && (
                <Button asChild variant="outline" className="rounded-full border-primary-foreground/50 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                  <Link to="/repayments">Repay now</Link>
                </Button>
              )}
            </div>
          </div>
          <div className="relative mx-auto grid h-40 w-40 place-items-center sm:h-44 sm:w-44">
            <div
              className="absolute inset-0 rounded-full transition-all duration-700"
              style={{ background: `conic-gradient(var(--golden) ${availPct * 3.6}deg, color-mix(in oklab, var(--primary-foreground) 20%, transparent) 0)` }}
            />
            <div className="absolute inset-3 rounded-full bg-primary" />
            <div className="relative text-center">
              <p className="text-xs opacity-80">Available</p>
              <p className="font-display text-2xl font-extrabold">{naira(available)}</p>
              <p className="text-xs opacity-80">of {naira(limitKobo)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: TrendingUp, label: "Credit limit", value: naira(limitKobo), hint: "Doubles when you repay on time · −30% when late", tone: "bg-primary/10 text-primary" },
          { icon: Wallet, label: "Available to borrow", value: naira(available), hint: "Maximum principal for your next loan", tone: "bg-golden/15 text-golden" },
          { icon: Receipt, label: "Outstanding", value: naira(credit?.outstanding_kobo ?? 0), hint: "Existing debt stays payable no matter what", tone: "bg-destructive/10 text-destructive" },
        ].map((s) => (
          <div key={s.label} className="group min-w-0 rounded-3xl border border-border/60 bg-card p-5 shadow-soft transition-all hover:-translate-y-1 hover:shadow-glow">
            <span className={`grid h-11 w-11 place-items-center rounded-2xl transition-transform group-hover:rotate-6 group-hover:scale-110 ${s.tone}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm text-muted-foreground">{s.label}</p>
            <p className="font-display text-2xl font-bold">{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
          </div>
        ))}
      </div>

      {!eligible && (
        <section className="rounded-3xl border border-golden/40 bg-card p-5 shadow-soft sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display font-semibold">
                <Timer className="mr-1.5 inline h-4 w-4 text-golden" />
                {hoursLeft > 0 ? `Eat Now & Pay Later unlocks in ${hoursLeft}h after registration` : "Verify your phone number to unlock"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Every customer waits 24 hours after registering, then verifies their phone with a 5-digit code.
              </p>
            </div>
            {hoursLeft === 0 && !verified && (
              <Button className="rounded-full" onClick={() => request.mutate()} disabled={sending || request.isPending}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Send code
              </Button>
            )}
          </div>
          <ol className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {unlockSteps.map((s, i) => (
              <li key={s.label} className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium ${s.done ? "bg-primary text-primary-foreground" : "bg-canvas text-muted-foreground"}`}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-primary-foreground/20" : "bg-card"}`}>
                  {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                {s.label}
              </li>
            ))}
          </ol>
        </section>
      )}


      {hoursLeft === 0 && !verified && codeSent && (
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
              Your code expires in 5 minutes. Wait at least 60 seconds before requesting another text. Delivery may take a moment.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card className="min-w-0 rounded-3xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <CalendarClock className="h-5 w-5 text-primary" /> Your loans
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loans.length === 0 ? (
            <EmptyState title="No loans yet" hint="Order eligible items with Eat Now & Pay Later — terms of 7, 14 or 30 days.">
              <Button asChild size="sm" className="rounded-full"><Link to="/order">Order food</Link></Button>
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {loans.slice(0, 6).map((l) => {
                const open = ["active", "partially_repaid", "overdue"].includes(l.status);
                return (
                  <div key={l.id} className={`grid gap-3 rounded-2xl p-4 transition-all hover:-translate-y-0.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center ${open ? "bg-primary/10 ring-1 ring-primary/30" : "bg-canvas"}`}>
                    <span className="hidden h-11 w-11 place-items-center rounded-2xl bg-card text-primary shadow-soft sm:grid">
                      <UtensilsCrossed className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">{l.item_summary ?? "Food order"}</p>
                      <p className="text-xs text-muted-foreground">
                        Borrowed {naira(l.principal_kobo)} · {l.term_days}-day term · due {formatDateTime(l.due_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={l.status} />
                      {open && (
                        <Button size="sm" className="rounded-full" asChild>
                          <Link to="/repayments">Repay</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 rounded-3xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <History className="h-5 w-5 text-golden" /> Credit-limit history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="rounded-2xl bg-canvas p-4 text-sm text-muted-foreground">Your limit changes appear here — every adjustment is recorded.</p>
          ) : (
            <ol className="relative space-y-4 border-l-2 border-dashed border-primary/30 pl-5">
              {history.map((h) => {
                const up = h.new_limit_kobo >= h.previous_limit_kobo;
                return (
                  <li key={h.id} className="relative">
                    <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-card ${up ? "bg-primary" : "bg-destructive"}`} />
                    <p className="text-xs text-muted-foreground">{formatDateTime(h.created_at)}</p>
                    <p className="text-sm font-medium">{statusLabel(h.adjustment_type)}{h.notes ? ` — ${h.notes}` : ""}</p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">{naira(h.previous_limit_kobo)}</span>
                      {" → "}
                      <span className={`font-semibold ${up ? "text-primary" : "text-destructive"}`}>{naira(h.new_limit_kobo)}</span>
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
