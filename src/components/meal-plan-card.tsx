import { ArrowRight, CalendarDays, Clock3, UtensilsCrossed } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { planLabel, tierLabel } from "@/lib/format";

export type DashboardMealPlan = {
  id: string;
  plan: string;
  tier: string;
  end_date: string | null;
};

export type DashboardMealEntitlement = {
  allowance: number;
  redeemed: number;
};

function daysUntil(value: string | null) {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

export function MealPlanCard({
  activePlan,
  todayEntitlements,
}: {
  activePlan?: DashboardMealPlan;
  todayEntitlements?: DashboardMealEntitlement[];
}) {
  if (!activePlan) {
    return (
      <section className="relative overflow-hidden rounded-3xl border border-golden/40 bg-gradient-to-br from-golden/20 via-card to-golden/5 p-5 shadow-soft">
        <div
          className="absolute -right-8 -top-10 size-32 rounded-full bg-golden/15 blur-2xl"
          aria-hidden="true"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-golden/20 px-3 py-1 text-xs font-semibold text-golden-foreground">
            <CalendarDays className="size-3.5" /> Meal plans
          </span>
          <h2 className="mt-4 max-w-sm font-display text-2xl font-extrabold leading-tight">
            Put your daily meals on autopilot
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Lock in discounted food rates with a flexible plan and pay seamlessly straight from your
            wallet or Card.
          </p>
          <Button asChild className="mt-5 rounded-full shadow-glow">
            <Link to="/subscription">
              View Meal Plans <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  const totalMeals = (todayEntitlements ?? []).reduce((total, item) => total + item.allowance, 0);
  const usedMeals = (todayEntitlements ?? []).reduce((total, item) => total + item.redeemed, 0);
  const mealsRemaining = Math.max(0, totalMeals - usedMeals);
  const daysLeft = daysUntil(activePlan.end_date);

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-brand p-5 text-primary-foreground shadow-glow">
      <div
        className="absolute -bottom-12 -right-8 size-36 rounded-full bg-golden/20 blur-2xl"
        aria-hidden="true"
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] opacity-80">
              <UtensilsCrossed className="size-3.5 text-golden" /> Live meal pass
            </p>
            <h2 className="mt-2 font-display text-2xl font-extrabold">
              {planLabel(activePlan.plan)} · {tierLabel(activePlan.tier)}
            </h2>
          </div>
          <span className="rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-semibold">
            Active
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-primary-foreground/10 p-3">
            <p className="text-xs opacity-75">Today</p>
            <p className="mt-1 font-display text-lg font-bold">
              {mealsRemaining} of {totalMeals}
            </p>
            <p className="text-xs opacity-75">meals available</p>
          </div>
          <div className="rounded-2xl bg-primary-foreground/10 p-3">
            <p className="flex items-center gap-1 text-xs opacity-75">
              <Clock3 className="size-3" /> Renewal
            </p>
            <p className="mt-1 font-display text-lg font-bold">{daysLeft} days</p>
            <p className="text-xs opacity-75">remaining</p>
          </div>
        </div>
        <Button asChild variant="secondary" className="mt-4 w-full rounded-full">
          <Link to="/order">
            Order Today&apos;s Meal <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
