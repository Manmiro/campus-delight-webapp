import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Coins, Send, Gift, ArrowUpRight, LockKeyhole, UtensilsCrossed, History, Sparkles } from 'lucide-react';
import { tokenAccountQuery, tokenLedgerQuery } from '@/lib/queries';
import { tokens as fmtTokens, naira, formatDateTime, statusLabel } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import logo from '@/assets/logo.jpg';

export const Route = createFileRoute('/_authenticated/_customer/tokens')({
  component: TokensPage,
  head: () => ({ meta: [{ title: 'Tokens — Campus Delight' }, { name: 'description', content: 'Spend Campus Delight tokens on meals, send tokens to friends and track your rewards.' }, { property: 'og:title', content: 'Tokens — Campus Delight' }, { property: 'og:description', content: 'Your rewards, token transfers and activity in one place.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] }),
});
function TokensPage() {
  const { data: tk } = useSuspenseQuery(tokenAccountQuery);
  const { data: ledger } = useSuspenseQuery(tokenLedgerQuery);
  const available = tk?.available_tokens ?? 0;
  const locked = tk?.locked_tokens ?? 0;
  return <div className="space-y-7">
    <header><p className="mb-1 text-xs font-semibold uppercase text-golden">Little rewards. Big cravings.</p><h1 className="font-display text-3xl font-bold">My tokens</h1><p className="mt-2 text-sm text-muted-foreground">Earn a little delight. Spend it on something delicious.</p></header>
    <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section className="relative overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground shadow-soft sm:p-8" aria-label="Available tokens">
        <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium"><Coins className="size-5" />Campus Delight rewards</span><img src={logo} alt="Campus Delight" className="size-11 rounded-full object-cover" /></div>
        <p className="mt-7 text-sm opacity-80">Ready to spend</p><div className="mt-2 flex flex-wrap items-baseline gap-2"><p className="break-all font-display text-5xl font-bold">{fmtTokens(available)}</p><span className="text-sm">tokens</span></div>
        <p className="mt-2 text-sm opacity-80">{naira(available * 100)} nominal value · 1 token = ₦1</p>
        <Button asChild variant="secondary" className="mt-7 h-12 w-full font-bold sm:w-auto"><Link to="/order"><UtensilsCrossed />Pay for a meal<ArrowUpRight /></Link></Button>
      </section>
      <section className="flex flex-col justify-center py-2 xl:pl-4" aria-label="Locked rewards"><span className="mb-4 grid size-12 place-items-center rounded-xl bg-accent text-golden"><LockKeyhole /></span><p className="text-sm font-medium text-muted-foreground">Rewards waiting to unlock</p><p className="mt-2 break-all font-display text-4xl font-bold">{fmtTokens(locked)} <span className="text-base font-medium text-muted-foreground">tokens</span></p><p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">Locked referral rewards unlock after your referral's first qualifying order.</p><Button asChild variant="link" className="mt-3 h-auto justify-start self-start px-0"><Link to="/refer">View your referrals<ArrowUpRight /></Link></Button></section>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Link to="/transfer-tokens" className="group flex min-w-0 items-center gap-4 rounded-xl border bg-card p-5 shadow-soft transition-transform motion-safe:hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Send className="size-6" /></span><div className="flex-1"><h2 className="text-base font-bold">Send some delight</h2><p className="mt-1 text-xs text-muted-foreground">Transfer tokens to a friend at your outlet.</p></div><ArrowUpRight className="size-5 shrink-0 text-primary" /></Link>
      <Link to="/refer" className="group flex min-w-0 items-center gap-4 rounded-xl border bg-card p-5 shadow-soft transition-transform motion-safe:hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-golden"><Gift className="size-6" /></span><div className="flex-1"><h2 className="text-base font-bold">Good food, better company</h2><p className="mt-1 text-xs text-muted-foreground">Invite friends and earn referral rewards.</p></div><ArrowUpRight className="size-5 shrink-0 text-golden" /></Link>
    </div>
    <div className="flex items-start gap-3 border-y py-4"><Sparkles className="mt-0.5 size-5 shrink-0 text-golden" /><p className="text-sm text-muted-foreground">Pay for your full order with available tokens. Wallet money and tokens cannot be combined.</p></div>
    <section aria-labelledby="token-activity"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="token-activity" className="font-display text-xl font-bold">Token activity</h2><p className="mt-1 text-xs text-muted-foreground">Your rewards and transfers, recorded every step of the way.</p></div><Button asChild variant="ghost" size="sm"><Link to="/history">All transactions<ArrowUpRight /></Link></Button></div>
      {ledger.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center"><History className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-semibold">Your next reward is a fresh start</p><p className="mt-1 text-sm text-muted-foreground">No token activity yet.</p></div> : <div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead className="pl-5">Activity</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Available after</TableHead><TableHead className="pr-5 text-right">Locked after</TableHead></TableRow></TableHeader><TableBody>{ledger.map(row => <TableRow key={row.id}><TableCell className="py-4 pl-5"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Coins className="size-4" /></span><div><p className="text-sm font-semibold">{statusLabel(row.tx_type)}</p><p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(row.created_at)}</p></div></div></TableCell><TableCell className="max-w-48 break-all font-mono text-xs text-muted-foreground">{row.reference}</TableCell><TableCell className="text-right font-bold text-primary">{fmtTokens(row.available_after)}</TableCell><TableCell className="pr-5 text-right text-muted-foreground">{fmtTokens(row.locked_after)}</TableCell></TableRow>)}</TableBody></Table></div>}
    </section>
  </div>;
}
