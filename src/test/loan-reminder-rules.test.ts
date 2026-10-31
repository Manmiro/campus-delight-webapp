import { describe, expect, it } from "vitest";
import { dueLabel, REMINDER_WINDOW_DAYS, shouldRemind } from "@/lib/loan-reminder-rules";

describe("Pay Later repayment reminders", () => {
  it("starts three days before the due date", () => {
    expect(REMINDER_WINDOW_DAYS).toBe(3);
    expect(shouldRemind(3, 92000)).toBe(true);
    expect(shouldRemind(4, 92000)).toBe(false);
  });
  it("still reminds on the due date itself", () => {
    expect(shouldRemind(0, 92000)).toBe(true);
    expect(dueLabel(0)).toBe("today");
  });
  it("stops after the due date", () => {
    expect(shouldRemind(-1, 92000)).toBe(false);
  });
  it("never reminds a fully repaid loan", () => {
    expect(shouldRemind(2, 0)).toBe(false);
  });
});
