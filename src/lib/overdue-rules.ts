/**
 * Automated overdue Pay Later rules (business-approved):
 * - 10% of the loan's original total due is added for every completed 24 hours unpaid, with no ceiling.
 * - Branded warning emails go out on overdue day 1 and day 2.
 * - Once a loan is 3 full days overdue, ordering pauses for every payment method except meal subscriptions.
 * - Token transfers are frozen as soon as any loan is overdue.
 * The database enforces all of this; these helpers mirror it for screens, emails and tests.
 */
export const OVERDUE_DAILY_PERCENT = 10;
export const ORDER_LOCK_AFTER_OVERDUE_DAYS = 3;
export const OVERDUE_WARNING_DAYS = [1, 2] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const SETTLED = new Set(["fully_repaid_on_time", "fully_repaid_late", "cancelled", "written_off"]);

export function isOpenLoanStatus(status: string): boolean {
  return !SETTLED.has(status);
}

/** Completed 24-hour periods since the due time (0 before or within the first day). */
export function completedOverdueDays(dueAt: string | Date, now: Date = new Date()): number {
  const diff = now.getTime() - new Date(dueAt).getTime();
  return diff > 0 ? Math.floor(diff / DAY_MS) : 0;
}

/** One day's overdue charge in kobo: 10% of the original total due, rounded down to the kobo. */
export function dailyOverdueChargeKobo(totalDueKobo: number): number {
  return Math.floor((totalDueKobo * OVERDUE_DAILY_PERCENT) / 100);
}

/** Total overdue charge after the given completed days — uncapped. */
export function overdueChargeKobo(totalDueKobo: number, completedDays: number): number {
  if (completedDays <= 0) return 0;
  return Math.floor((totalDueKobo * OVERDUE_DAILY_PERCENT * completedDays) / 100);
}

/** When ordering pauses for a loan: 3 full days after its due time. */
export function orderLockAt(dueAt: string | Date): Date {
  return new Date(new Date(dueAt).getTime() + ORDER_LOCK_AFTER_OVERDUE_DAYS * DAY_MS);
}

type LoanLike = { status: string; due_at: string };

export function loanRestrictions(loans: readonly LoanLike[], now: Date = new Date()) {
  const open = loans.filter((l) => isOpenLoanStatus(l.status));
  const overdue = open.filter((l) => new Date(l.due_at).getTime() < now.getTime());
  const locked = overdue.filter((l) => orderLockAt(l.due_at).getTime() <= now.getTime());
  const nextLock = overdue.filter((l) => !locked.includes(l)).map((l) => orderLockAt(l.due_at)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return {
    hasOverdue: overdue.length > 0,
    transfersFrozen: overdue.length > 0,
    orderingLocked: locked.length > 0,
    nextLockAt: nextLock,
  };
}

/** Payment methods still allowed while ordering is locked. */
export function allowedWhileLocked(method: string): boolean {
  return method === "subscription_entitlement";
}

export function overdueWarningCopy(overdueDay: number) {
  if (overdueDay >= 2) {
    return {
      badge: "OVERDUE · DAY 2 · FINAL REMINDER",
      title: "Let's sort this out today 🙏",
      line: "Your Pay Later repayment is now two days overdue. We know campus life gets busy — but tomorrow ordering pauses on your account, and a 10% overdue charge keeps adding up every 24 hours.",
      warning: "From tomorrow, cash wallet, token and Pay Later orders pause until this is cleared. Meal subscriptions still work.",
    };
  }
  return {
    badge: "OVERDUE · DAY 1",
    title: "Your repayment slipped past its date 😕",
    line: "No stress — it happens! Your Pay Later repayment is one day overdue. Clear it today to stop the 10% overdue charge that's added for every 24 hours it stays unpaid.",
    warning: "Token transfers are paused while the loan is overdue, and ordering pauses if it stays unpaid for 3 days.",
  };
}
