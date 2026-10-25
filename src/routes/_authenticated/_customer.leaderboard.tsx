import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Crown, Flame, ShoppingBag, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/queries";
import { Switch } from "@/components/ui/switch";

const leaderboardQuery = queryOptions({
  queryKey: ["me", "leaderboard"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("weekly_leaderboard");
    if (error) throw new Error(error.message);
    return data ?? [];
  },
});

export const Route = createFileRoute("/_authenticated/_customer/leaderboard")({
  loader: ({ context }) => context.queryClient.ensureQueryData(leaderboardQuery),
  component: LeaderboardPage,
  head: () => ({ meta: [
    { title: "Weekly Leaderboard — Campus Delight" },
    { name: "description", content: "See this week's top foodies at your Campus Delight outlet." },
    { property: "og:title", content: "Weekly Leaderboard — Campus Delight" },
    { property: "og:description", content: "This week's top foodies at your outlet." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

const medal = ["🥇", "🥈", "🥉"];

function LeaderboardPage() {
  const qc = useQueryClient();
  const { data: profile } = useSuspenseQuery(profileQuery);
  const { data: rows } = useSuspenseQuery(leaderboardQuery);
  const optedIn = !!profile.leaderboard_opt_in;
  const me = rows.find((r) => r.is_me);
  const top3 = rows.filter((r) => r.rank <= 3).slice(0, 3);

  const toggle = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase.from("profiles").update({ leaderboard_opt_in: value }).eq("id", profile.id);
      if (error) throw new Error(error.message);
      return value;
    },
    onSuccess: (v) => {
      toast.success(v ? "You're on the board! Let's go 🔥" : "You're hidden from the leaderboard.");
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-brand p-5 text-primary-foreground shadow-glow sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-golden/30 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm opacity-85"><Trophy className="h-4 w-4 text-golden" /> {profile.outlet?.name ?? "Your outlet"}</p>
            <h1 className="font-display text-3xl font-extrabold sm:text-4xl">This week's top foodies</h1>
            <p className="mt-1 text-sm opacity-90">10 points per order · 2 points per daily check-in · resets every Monday</p>
          </div>
          {me && (
            <div className="rounded-2xl bg-golden px-5 py-3 text-center text-golden-foreground">
              <p className="text-xs opacity-85">Your rank</p>
              <p className="font-display text-3xl font-extrabold">#{me.rank}</p>
              <p className="text-xs">{me.points} pts</p>
            </div>
          )}
        </div>
      </section>

      <label className="flex items-center justify-between gap-4 rounded-3xl border border-border/60 bg-card p-4 shadow-soft">
        <div>
          <p className="font-semibold">Show me on the leaderboard</p>
          <p className="text-xs text-muted-foreground">Others see only your first name and last initial. You can hide anytime.</p>
        </div>
        <Switch checked={optedIn} disabled={toggle.isPending} onCheckedChange={(v) => toggle.mutate(v)} />
      </label>

      {top3.length > 0 && (
        <div className="grid grid-cols-3 items-end gap-3">
          {[1, 0, 2].map((i) => {
            const r = top3[i];
            if (!r) return <div key={i} />;
            const h = i === 0 ? "h-40" : i === 1 ? "h-32" : "h-28";
            return (
              <div key={i} className={`flex ${h} flex-col items-center justify-end rounded-3xl p-3 text-center shadow-soft ${i === 0 ? "bg-gradient-golden text-golden-foreground" : "bg-card"} ${r.is_me ? "ring-2 ring-primary" : ""}`}>
                {i === 0 && <Crown className="mb-1 h-6 w-6 animate-wiggle" />}
                <span className="text-3xl">{medal[i]}</span>
                <p className="w-full truncate font-display font-bold">{r.display_name}</p>
                <p className="text-xs opacity-80">{r.points} pts</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-3xl border border-border/60 bg-card p-4 shadow-soft sm:p-5">
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-canvas p-4 text-sm text-muted-foreground">No players yet this week — order or check in to get on the board!</p>
        ) : (
          <ol className="space-y-2">
            {rows.map((r) => (
              <li key={`${r.rank}-${r.display_name}-${r.is_me}`} className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-2.5 ${r.is_me ? "bg-primary/10 ring-1 ring-primary/40" : "bg-canvas"}`}>
                <span className="text-center font-display text-lg font-bold">{r.rank <= 3 ? medal[r.rank - 1] : `#${r.rank}`}</span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.display_name}{r.is_me ? " (you)" : ""}</p>
                  <p className="flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><ShoppingBag className="h-3 w-3" /> {r.orders}</span>
                    <span className="flex items-center gap-1"><Flame className="h-3 w-3" /> {r.checkins}</span>
                  </p>
                </div>
                <span className="font-display font-bold text-primary">{r.points}</span>
              </li>
            ))}
          </ol>
        )}
        {!optedIn && me && <p className="mt-3 text-xs text-muted-foreground">Only you can see your row until you switch on "Show me on the leaderboard".</p>}
      </div>
    </div>
  );
}
