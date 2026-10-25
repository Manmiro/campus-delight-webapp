// Engagement rules: levels, badges, referral milestones, birthdays and streak rewards.
// Daily check-in token amounts are awarded server-side by claim_daily_checkin(); these
// constants mirror it for display only. Amounts are provisional pending business approval.

export const SPIN_MIN_TOKENS = 1;
export const SPIN_MAX_TOKENS = 20;
/** Streak bonus shown to the customer; must match claim_daily_checkin(). */
export function streakBonusFor(streak: number): number {
  if (streak > 0 && streak % 30 === 0) return 200;
  if (streak > 0 && streak % 7 === 0) return 50;
  if (streak === 3) return 20;
  return 0;
}
export function nextStreakMilestone(streak: number): number {
  if (streak < 3) return 3;
  if (streak < 7) return 7;
  const nextSeven = Math.ceil((streak + 1) / 7) * 7;
  const nextThirty = Math.ceil((streak + 1) / 30) * 30;
  return Math.min(nextSeven, nextThirty);
}

export const LEVELS: readonly { name: string; minOrders: number; emoji: string }[] = [
  { name: "Fresher", minOrders: 0, emoji: "🌱" },
  { name: "Regular", minOrders: 5, emoji: "🍛" },
  { name: "Foodie", minOrders: 15, emoji: "🔥" },
  { name: "Campus Legend", minOrders: 40, emoji: "👑" },
];

export function levelFor(orderCount: number) {
  let idx = 0;
  LEVELS.forEach((l, i) => { if (orderCount >= l.minOrders) idx = i; });
  const next = LEVELS[idx + 1];
  const cur = LEVELS[idx] ?? { name: "Fresher", minOrders: 0, emoji: "🌱" };
  const progress = next ? Math.round(((orderCount - cur.minOrders) / (next.minOrders - cur.minOrders)) * 100) : 100;
  return { ...cur, index: idx, next, progress, ordersToNext: next ? next.minOrders - orderCount : 0 };
}

export type BadgeInput = {
  orderCount: number;
  distinctItems: number;
  weekendOrders: number;
  onTimeRepayments: number;
  qualifiedReferrals: number;
  bestStreak: number;
};

export const BADGES = [
  { id: "first-order", emoji: "🎉", name: "First bite", hint: "Place your first order", earned: (b: BadgeInput) => b.orderCount >= 1 },
  { id: "explorer", emoji: "🧭", name: "Menu explorer", hint: "Try 5 different dishes", earned: (b: BadgeInput) => b.distinctItems >= 5 },
  { id: "weekend", emoji: "🎈", name: "Weekend warrior", hint: "Order on 3 weekends", earned: (b: BadgeInput) => b.weekendOrders >= 3 },
  { id: "paid-on-time", emoji: "✅", name: "Trusted payer", hint: "Repay a Pay Later loan on time", earned: (b: BadgeInput) => b.onTimeRepayments >= 1 },
  { id: "connector", emoji: "🤝", name: "Squad builder", hint: "Bring 5 friends who order", earned: (b: BadgeInput) => b.qualifiedReferrals >= 5 },
  { id: "streak-7", emoji: "🔥", name: "On fire", hint: "Reach a 7-day check-in streak", earned: (b: BadgeInput) => b.bestStreak >= 7 },
];

export function badgesFor(input: BadgeInput) {
  return BADGES.map((b) => ({ id: b.id, emoji: b.emoji, name: b.name, hint: b.hint, earned: b.earned(input) }));
}

export const REFERRAL_MILESTONES = [1, 3, 5, 10] as const;
export function referralMilestone(qualified: number) {
  const target = REFERRAL_MILESTONES.find((m) => m > qualified) ?? null;
  const prev = [...REFERRAL_MILESTONES].reverse().find((m) => m <= qualified) ?? 0;
  const progress = target ? Math.round(((qualified - prev) / (target - prev)) * 100) : 100;
  return { target, progress, remaining: target ? target - qualified : 0 };
}

/** Birthday check in Africa/Lagos calendar terms; dob is YYYY-MM-DD. */
export function isBirthday(dob: string | null | undefined, now = new Date()): boolean {
  if (!dob) return false;
  const lagos = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  const [, m, d] = dob.split("-").map(Number);
  return lagos.getMonth() + 1 === m && lagos.getDate() === d;
}
