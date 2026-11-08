import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Check, Copy, Gift, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import logoImg from "@/assets/logo.webp.asset.json";
import { profileQuery, referralsQuery } from "@/lib/queries";
import { tokens as fmtTokens, formatDateTime } from "@/lib/format";
import { StatCard, StatusBadge } from "@/components/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_customer/refer")({
  component: ReferPage,
  head: () => ({ meta: [{"title": "Refer & Earn — Campus Delight"}, {"name": "description", "content": "Share your Campus Delight referral link and track earned and locked token rewards."}, {"property": "og:title", "content": "Refer & Earn — Campus Delight"}, {"property": "og:description", "content": "Share your Campus Delight referral link and track earned and locked token rewards."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
});

function ReferPage() {
  const celebrationSequence = useRef(0);
  const [copied, setCopied] = useState<{ kind: "link" | "code"; id: number } | null>(null);
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: referrals } = useSuspenseQuery(referralsQuery);

  const referralLink = `${window.location.origin}/auth?mode=signup&ref=${profile.referral_code}`;

  const copyReferralValue = (value: string, kind: "link" | "code", label: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      const celebrationId = celebrationSequence.current + 1;
      celebrationSequence.current = celebrationId;
      setCopied({ kind, id: celebrationId });
      toast.success(`${label} copied`);
      window.setTimeout(() => setCopied((current) => current?.id === celebrationId ? null : current), 1700);
    }).catch(() => toast.error(`Could not copy the ${label.toLowerCase()}`));
  };

  const rewarded = referrals.filter((r) => r.status === "rewarded").length;
  const pending = referrals.filter((r) => r.status === "locked").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total referrals" value={referrals.length} icon={<Gift className="h-5 w-5 text-primary" />} />
        <StatCard label="Rewards unlocked" value={fmtTokens(rewarded * 100)} hint={`${rewarded} qualified`} />
        <StatCard label="Locked rewards" value={fmtTokens(pending * 100)} icon={<Lock className="h-5 w-5 text-golden" />} hint={`${pending} awaiting first order`} />
      </div>

      <Card className="relative overflow-visible">
        {copied && (
          <div key={copied.id} className="pointer-events-none absolute inset-x-0 -top-4 z-10 flex justify-center" role="status" aria-live="polite">
            <div className="animate-copy-success relative flex items-center gap-2 rounded-full bg-gradient-brand px-3 py-2 text-primary-foreground shadow-glow">
              <span className="absolute -inset-2 rounded-full border border-golden/70 animate-copy-ring" aria-hidden="true" />
              <span className="absolute -left-5 -top-3 animate-copy-token text-xs font-black text-golden" aria-hidden="true">+1</span>
              <span className="absolute -right-5 bottom-0 animate-copy-token text-xs font-black text-golden [animation-delay:160ms]" aria-hidden="true">+1</span>
              <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-primary-foreground shadow-sm">
                <img src={logoImg.url} decoding="async" alt="" className="h-full w-full animate-copy-logo object-cover" />
              </span>
              <span className="text-xs font-extrabold tracking-wide">Copied!</span>
              <span className="hidden text-xs opacity-80 sm:inline">{copied.kind === "link" ? "Link ready to share" : "Code ready to share"}</span>
              <Sparkles className="h-4 w-4 text-golden" aria-hidden="true" />
              <span className="absolute -right-3 -top-2 animate-copy-spark text-lg text-golden" aria-hidden="true">✦</span>
              <span className="absolute -bottom-2 -left-2 animate-copy-spark text-golden [animation-delay:120ms]" aria-hidden="true">✦</span>
            </div>
          </div>
        )}
        <CardContent className="grid gap-5 p-5 md:grid-cols-2 md:gap-6">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:block">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Your referral link</p>
              <p className="max-w-xl truncate font-mono text-sm">{referralLink}</p>
            </div>
            <Button className={`shrink-0 transition-transform active:scale-95 ${copied?.kind === "link" ? "animate-copy-button" : ""}`} onClick={() => copyReferralValue(referralLink, "link", "Referral link")}>
              {copied?.kind === "link" ? <><Check className="animate-pop-in" /> Copied</> : <><Copy className="mr-2 h-4 w-4" /> Copy link</>}
            </Button>
          </div>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:block">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Your referral code</p>
              <p className="font-mono text-sm font-semibold tracking-wide">{profile.referral_code}</p>
            </div>
            <Button variant="outline" className={`shrink-0 transition-transform active:scale-95 ${copied?.kind === "code" ? "animate-copy-button" : ""}`} onClick={() => copyReferralValue(profile.referral_code, "code", "Referral code")}>
              {copied?.kind === "code" ? <><Check className="animate-pop-in" /> Copied</> : <><Copy className="mr-2 h-4 w-4" /> Copy code</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        You earn <span className="font-semibold text-foreground">100 tokens</span> when your friend completes registration —
        locked until they place their <span className="font-semibold text-foreground">first order</span>. Locked tokens can't be transferred.
      </p>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="font-display text-lg">Referral history</CardTitle></CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No referrals yet — share your link!</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referred customer</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Reward</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{r.referred?.full_name ?? r.referred?.customer_code}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right text-sm font-semibold">{fmtTokens(r.locked_tokens)}</TableCell>
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
