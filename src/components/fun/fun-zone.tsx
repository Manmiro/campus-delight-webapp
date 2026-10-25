import { useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Flame, Gift, Loader2, RotateCw, Sparkles, Cake, Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/fun/confetti";
import {
  SPIN_MAX_TOKENS, SPIN_MIN_TOKENS, badgesFor, isBirthday, levelFor, nextStreakMilestone, referralMilestone, streakBonusFor,
} from "@/lib/fun-rules";

export const checkinsQuery = queryOptions({
  queryKey: ["me", "checkins"],
  queryFn: async () => {
    const { data, error } = await supabase.from("daily_checkins").select("checkin_date, streak, spin_tokens, bonus_tokens")
      .order("checkin_date", { ascending: false }).limit(60);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

function lagosToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}
function lagosYesterday() {
  return new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
}

type OrderLite = { created_at: string; status: string; order_items: { item_name: string; quantity: number }[] };
type LoanLite = { status: string };
type ReferralLite = { status: string };

export function FunZone({ orders, loans, referrals, dob, firstName }: {
  orders: OrderLite[]; loans: LoanLite[]; referrals: ReferralLite[]; dob: string | null; firstName: string;
}) {
  const qc = useQueryClient();
  const { data: checkins = [] } = useQuery(checkinsQuery);
  const [fire, setFire] = useState(0);
  const [result, setResult] = useState<{ spin: number; bonus: number; streak: number } | null>(null);

  const today = lagosToday();
  const last = checkins[0];
  const checkedToday = last?.checkin_date === today;
  const liveStreak = last && (last.checkin_date === today || last.checkin_date === lagosYesterday()) ? last.streak : 0;
  const bestStreak = checkins.reduce((m, c) => Math.max(m, c.streak), 0);
  const nextMs = nextStreakMilestone(liveStreak);

  const claim = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("claim_daily_checkin");
      if (error) throw new Error(error.message);
      return data as { spin: number; bonus: number; streak: number; total: number };
    },
    onSuccess: (r) => {
      setTimeout(() => {
        setResult(r);
        setFire((f) => f + 1);
        toast.success(`+${r.total} tokens! ${r.bonus ? `Streak bonus +${r.bonus} 🔥` : "See you tomorrow 👋"}`);
        void qc.invalidateQueries({ queryKey: ["me"] });
      }, 1600);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not check in"),
  });
  const spinning = claim.isPending || (claim.isSuccess && !result);

  const counted = orders.filter((o) => o.status !== "cancelled");
  const level = levelFor(counted.length);
  const itemNames = new Set(counted.flatMap((o) => o.order_items.map((i) => i.item_name)));
  const weekendOrders = new Set(counted.filter((o) => [0, 5, 6].includes(new Date(o.created_at).getDay())).map((o) => o.created_at.slice(0, 10))).size;
  const qualified = referrals.filter((r) => ["qualified", "rewarded"].includes(r.status)).length;
  const badges = badgesFor({
    orderCount: counted.length, distinctItems: itemNames.size, weekendOrders,
    onTimeRepayments: loans.filter((l) => l.status === "fully_repaid_on_time").length,
    qualifiedReferrals: qualified, bestStreak,
  });
  const earned = badges.filter((b) => b.earned).length;
  const ref = referralMilestone(qualified);
  const usual = counted[0]?.order_items[0];
  const birthday = isBirthday(dob);

  return (
    <>
      <Confetti fire={fire} />
      {birthday && (
        <div className="flex items-center gap-3 rounded-3xl bg-gradient-golden p-4 text-golden-foreground shadow-soft">
          <Cake className="h-8 w-8 shrink-0 animate-wiggle" />
          <div>
            <p className="font-display text-lg font-bold">Happy birthday, {firstName}! 🎂</p>
            <p className="text-sm opacity-90">The whole Campus Delight family is celebrating you today.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Daily spin + streak */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-brand p-5 text-primary-foreground shadow-glow">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 font-display font-bold"><Flame className="h-5 w-5 text-golden" /> {liveStreak}-day streak</p>
            <span className="rounded-full bg-primary-foreground/15 px-2.5 py-0.5 text-xs">Best {bestStreak}</span>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className={`grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-dashed border-golden bg-primary-foreground/10 ${spinning ? "animate-spin-wheel" : ""}`}>
              <Sparkles className="h-8 w-8 text-golden" />
            </div>
            <div className="min-w-0">
              {result && checkedToday ? (
                <p className="animate-pop-in font-display text-2xl font-extrabold">+{result.spin + result.bonus} tokens</p>
              ) : (
                <p className="font-display text-lg font-bold">{checkedToday ? "Done for today ✅" : "Daily spin is ready!"}</p>
              )}
              <p className="text-xs opacity-85">
                Win {SPIN_MIN_TOKENS}–{SPIN_MAX_TOKENS} tokens daily. Day {nextMs} streak bonus: +{streakBonusFor(nextMs)}
              </p>
            </div>
          </div>
          <Button variant="secondary" className="mt-4 w-full rounded-full" disabled={checkedToday || spinning} onClick={() => claim.mutate()}>
            {spinning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
            {checkedToday ? "Come back tomorrow" : "Spin & check in"}
          </Button>
        </div>

        {/* Level + badges */}
        <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <p className="font-display font-bold">{level.emoji} {level.name}</p>
            <span className="text-xs text-muted-foreground">{earned}/{badges.length} badges</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-brand transition-all duration-700" style={{ width: `${level.progress}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {level.next ? `${level.ordersToNext} more order${level.ordersToNext === 1 ? "" : "s"} to ${level.next.emoji} ${level.next.name}` : "Top level reached — legend!"}
          </p>
          <div className="mt-4 grid grid-cols-6 gap-1.5">
            {badges.map((b) => (
              <span key={b.id} title={`${b.name} — ${b.hint}`}
                className={`grid aspect-square place-items-center rounded-xl text-lg transition-transform hover:scale-110 ${b.earned ? "bg-golden/20" : "bg-muted opacity-40 grayscale"}`}>
                {b.emoji}
              </span>
            ))}
          </div>
        </div>

        {/* Usual + referral milestone */}
        <div className="flex flex-col gap-4">
          <Link to="/order" className="group flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:ring-2 hover:ring-primary">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Repeat className="h-5 w-5 group-hover:rotate-180 transition-transform duration-500" /></span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{usual ? "Your usual?" : "Hungry?"}</p>
              <p className="truncate font-semibold">{usual ? usual.item_name : "Order your first meal"}</p>
            </div>
          </Link>
          <Link to="/refer" className="rounded-3xl border border-border/60 bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:ring-2 hover:ring-golden">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Gift className="h-4 w-4 text-golden" />
              {ref.target ? `${ref.remaining} more friend${ref.remaining === 1 ? "" : "s"} to reach ${ref.target}` : "Referral champion!"}
            </p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-golden transition-all duration-700" style={{ width: `${ref.progress}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{qualified} friend{qualified === 1 ? "" : "s"} ordered · 100 tokens each</p>
          </Link>
        </div>
      </div>
    </>
  );
}
