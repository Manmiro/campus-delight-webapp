import { describe, expect, it } from "vitest";
import { streakBonusFor, nextStreakMilestone, levelFor, referralMilestone, isBirthday, badgesFor } from "@/lib/fun-rules";

describe("fun rules", () => {
  it("streak bonuses: 3 days → 20, 7 → 50, 30 → 200, otherwise 0", () => {
    expect(streakBonusFor(3)).toBe(20);
    expect(streakBonusFor(7)).toBe(50);
    expect(streakBonusFor(14)).toBe(50);
    expect(streakBonusFor(30)).toBe(200);
    expect(streakBonusFor(4)).toBe(0);
  });
  it("next streak milestone", () => {
    expect(nextStreakMilestone(1)).toBe(3);
    expect(nextStreakMilestone(5)).toBe(7);
    expect(nextStreakMilestone(28)).toBe(30);
  });
  it("levels by order count", () => {
    expect(levelFor(0).name).toBe("Fresher");
    expect(levelFor(5).name).toBe("Regular");
    expect(levelFor(40).name).toBe("Campus Legend");
    expect(levelFor(3).ordersToNext).toBe(2);
  });
  it("referral milestones", () => {
    expect(referralMilestone(0).target).toBe(1);
    expect(referralMilestone(4)).toMatchObject({ target: 5, remaining: 1 });
    expect(referralMilestone(10).target).toBeNull();
  });
  it("birthday in Lagos time", () => {
    expect(isBirthday("2004-10-25", new Date("2026-10-25T12:00:00Z"))).toBe(true);
    expect(isBirthday("2004-10-26", new Date("2026-10-25T12:00:00Z"))).toBe(false);
  });
  it("first-bite badge needs one order", () => {
    const base = { orderCount: 0, distinctItems: 0, weekendOrders: 0, onTimeRepayments: 0, qualifiedReferrals: 0, bestStreak: 0 };
    expect(badgesFor(base).find((b) => b.id === "first-order")?.earned).toBe(false);
    expect(badgesFor({ ...base, orderCount: 1 }).find((b) => b.id === "first-order")?.earned).toBe(true);
  });
});
