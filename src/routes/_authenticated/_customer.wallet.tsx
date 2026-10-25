import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useSuspenseQuery, useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ArrowDownLeft, ArrowUpRight, Wallet, Plus, ShieldCheck, Loader2, UtensilsCrossed, ReceiptText, Check, ArrowRight } from 'lucide-react';
import { initializePayment } from '@/lib/payments.functions';
import { paymentInput } from '@/lib/payment-rules';
import { walletQuery, walletLedgerQuery, profileQuery } from '@/lib/queries';
import { naira, formatDateTime, statusLabel } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import logo from '@/assets/logo.jpg';

export const Route = createFileRoute('/_authenticated/_customer/wallet')({
  component: WalletPage,
  head: () => ({ meta: [{ title: 'Wallet — Campus Delight' }, { name: 'description', content: 'Top up your Campus Delight wallet with Paystack, pay for meals and track your wallet activity.' }, { property: 'og:title', content: 'Wallet — Campus Delight' }, { property: 'og:description', content: 'Your meal money, secure top-ups and wallet activity in one place.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
});
const PRESETS = [100000, 200000, 500000];

function WalletPage() {
  const initPayment = useServerFn(initializePayment);
  const { data: wallet } = useSuspenseQuery(walletQuery);
  const { data: ledger } = useSuspenseQuery(walletLedgerQuery);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const [amount, setAmount] = useState('2000');
  const [attempted, setAttempted] = useState(false);
  const kobo = Number(amount) * 100;
  const validAmount = amount.trim() !== '' && paymentInput.safeParse({ purpose: 'wallet_funding', amountKobo: kobo, origin: 'https://campus-delight-webapp.lovable.app' }).success;
  const fund = useMutation({
    mutationFn: async () => {
      const data = paymentInput.parse({ purpose: 'wallet_funding', amountKobo: kobo, origin: window.location.origin });
      const result = await initPayment({ data });
      window.location.assign(result.authorizationUrl);
    },
  });
  const incoming = ledger.filter(row => row.amount_kobo > 0).reduce((sum, row) => sum + row.amount_kobo, 0);
  const outgoing = ledger.filter(row => row.amount_kobo < 0).reduce((sum, row) => sum - row.amount_kobo, 0);

  return <div className="space-y-7">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="mb-1 text-xs font-semibold uppercase text-primary">Your meal money</p><h1 className="font-display text-3xl font-bold">My wallet</h1><p className="mt-2 text-sm text-muted-foreground">Good food starts with a ready wallet.</p></div>
      <Button asChild variant="outline"><Link to="/order"><UtensilsCrossed />Order food<ArrowUpRight /></Link></Button>
    </header>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className="relative overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground shadow-soft sm:p-8" aria-label="Wallet balance">
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium"><Wallet className="size-5" />Campus Delight wallet</span><img src={logo} alt="Campus Delight" className="size-11 rounded-full object-cover" /></div>
          <p className="mt-8 text-sm opacity-80">Available balance</p>
          <p className="mt-2 break-all font-display text-4xl font-bold sm:text-5xl">{naira(wallet?.balance_kobo)}</p>
          <div className="mt-8 flex flex-wrap items-end justify-between gap-3 border-t border-primary-foreground/20 pt-4"><div><p className="text-xs opacity-80">{profile.outlet?.name ?? 'No outlet assigned'}</p><p className="mt-1 font-mono text-sm">{profile.customer_code}</p></div><span className="flex items-center gap-1 text-xs"><ShieldCheck className="size-4" />Verified top-ups only</span></div>
        </section>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-4 shadow-soft"><ArrowDownLeft className="mb-3 size-5 text-primary" /><p className="text-xs text-muted-foreground">Credits in activity</p><p className="mt-1 break-all text-xl font-bold">{naira(incoming)}</p></div>
          <div className="rounded-xl border bg-card p-4 shadow-soft"><ArrowUpRight className="mb-3 size-5 text-golden" /><p className="text-xs text-muted-foreground">Debits in activity</p><p className="mt-1 break-all text-xl font-bold">{naira(outgoing)}</p></div>
        </div>
      </div>
      <section className="min-w-0 py-2 xl:pl-5" aria-labelledby="fund-title">
        <div className="mb-5 flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary"><Plus /></span><div><h2 id="fund-title" className="font-display text-xl font-bold">Add money</h2><p className="text-xs text-muted-foreground">Top up now. Enjoy your next meal.</p></div></div>
        {profile.outlet_id ? <form className="space-y-5" onSubmit={event => { event.preventDefault(); setAttempted(true); if (validAmount && !fund.isPending) fund.mutate(); }}>
          <fieldset disabled={fund.isPending} className="space-y-5">
            <div className="grid grid-cols-3 gap-2">{PRESETS.map(p => <Button key={p} type="button" variant={kobo === p ? 'secondary' : 'outline'} aria-pressed={kobo === p} className="h-12 px-2 font-bold" onClick={() => { setAmount(String(p / 100)); fund.reset(); }}>{kobo === p && <Check className="hidden sm:block" />}{naira(p)}</Button>)}</div>
            <div><Label htmlFor="amount">Top-up amount (₦)</Label><Input id="amount" className="mt-2 h-14 text-xl font-bold" inputMode="decimal" autoComplete="off" value={amount} aria-invalid={attempted && !validAmount} aria-describedby={attempted && !validAmount ? 'amount-error' : undefined} onChange={event => { setAmount(event.target.value); fund.reset(); }} />{attempted && !validAmount && <p id="amount-error" role="alert" className="mt-2 text-sm text-destructive">Enter a valid amount, with no more than two decimal places.</p>}</div>
            <div className="flex items-center justify-between gap-3 border-t pt-4 text-sm"><span className="text-muted-foreground">Amount to add</span><span className="break-all font-bold">{validAmount ? naira(kobo) : '—'}</span></div>
            <Button type="submit" className="h-12 w-full text-base" disabled={fund.isPending}>{fund.isPending ? <><Loader2 className="animate-spin" />Opening Paystack…</> : <><Plus />{validAmount ? `Add ${naira(kobo)}` : 'Add money'}<ArrowRight /></>}</Button>
          </fieldset>
          {fund.isError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{fund.error instanceof Error ? fund.error.message : 'Could not start payment. Please try again.'}</div>}
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" />Secure checkout with Paystack</p>
        </form> : <p className="rounded-lg bg-secondary p-4 text-sm text-muted-foreground">Funding unlocks once your outlet is assigned.</p>}
      </section>
    </div>
    <section aria-labelledby="wallet-activity"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="wallet-activity" className="font-display text-xl font-bold">Wallet activity</h2><p className="mt-1 text-xs text-muted-foreground">Every top-up and payment, all accounted for.</p></div><Button asChild variant="ghost" size="sm"><Link to="/history">All transactions<ArrowUpRight /></Link></Button></div>
      {ledger.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center"><ReceiptText className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-semibold">Your wallet story starts here</p><p className="mt-1 text-sm text-muted-foreground">No wallet activity yet.</p></div> : <div className="divide-y rounded-xl border bg-card px-4 sm:px-5">{ledger.map(row => <div key={row.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-4"><span className={`grid size-10 place-items-center rounded-xl ${row.amount_kobo < 0 ? 'bg-accent text-golden' : 'bg-secondary text-primary'}`}>{row.amount_kobo < 0 ? <ArrowUpRight className="size-5" /> : <ArrowDownLeft className="size-5" />}</span><div><p className="text-sm font-semibold">{row.description || statusLabel(row.tx_type)}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(row.created_at)}</p></div><div className="text-right"><p className={`break-all text-sm font-bold ${row.amount_kobo < 0 ? 'text-foreground' : 'text-primary'}`}>{row.amount_kobo > 0 ? '+' : ''}{naira(row.amount_kobo)}</p><p className="mt-1 text-xs text-muted-foreground">Balance {naira(row.balance_after_kobo)}</p></div></div>)}</div>}
    </section>
  </div>;
}
