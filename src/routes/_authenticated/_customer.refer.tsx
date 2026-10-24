import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Gift, Lock } from "lucide-react";
import { toast } from "sonner";
import { profileQuery, referralsQuery, tokenAccountQuery } from "@/lib/queries";
import { tokens as fmtTokens, formatDateTime } from "@/lib/format";
import { StatCard, StatusBadge } from "@/components/bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/_customer/refer")({
  component: ReferPage,
  head: () => ({ meta: [{ title: "Refer & Earn — Campus Delight" }] }),
});

function ReferPage() {
  const qc = useQueryClient();
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: referrals } = useSuspenseQuery(referralsQuery);
  const { data: tk } = useSuspenseQuery(tokenAccountQuery);

  const referralLink = `${window.location.origin}/auth?mode=signup&ref=${profile.referral_code}`;

  const rewarded = referrals.filter((r) => r.status === "rewarded").length;
  const pending = referrals.filter((r) => r.status === "locked").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total referrals" value={referrals.length} icon={<Gift className="h-5 w-5 text-primary" />} />
        <StatCard label="Rewards unlocked" value={fmtTokens(rewarded * 100)} hint={`${rewarded} qualified`} />
        <StatCard label="Locked rewards" value={fmtTokens(pending * 100)} icon={<Lock className="h-5 w-5 text-golden" />} hint={`${pending} awaiting first order`} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Your referral link</p>
            <p className="max-w-xl truncate font-mono text-sm">{referralLink}</p>
          </div>
          <Button onClick={() => { void navigator.clipboard.writeText(referralLink); toast.success("Referral link copied"); }}>
            <Copy className="mr-2 h-4 w-4" /> Copy link
          </Button>
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
