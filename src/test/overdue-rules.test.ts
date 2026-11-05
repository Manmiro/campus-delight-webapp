// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { completedOverdueDays, overdueChargeKobo, loanRestrictions, allowedWhileLocked } from '../lib/overdue-rules';

describe('Approved overdue rules', () => {
  const due = '2026-11-01T11:00:00Z';
  it('adds 10% only after each completed 24 hours', () => {
    expect(completedOverdueDays(due, new Date('2026-11-02T10:59:59Z'))).toBe(0);
    expect(overdueChargeKobo(92000, completedOverdueDays(due, new Date('2026-11-02T11:00:00Z')))).toBe(9200);
  });
  it('does not compound or cap daily charges', () => {
    expect(overdueChargeKobo(92000, 20)).toBe(184000);
  });
  it('locks ordering at three completed overdue days', () => {
    expect(loanRestrictions([{status:'active',due_at:due}],new Date('2026-11-04T10:59:59Z')).orderingLocked).toBe(false);
    expect(loanRestrictions([{status:'active',due_at:due}],new Date('2026-11-04T11:00:00Z')).orderingLocked).toBe(true);
  });
  it('keeps meal subscriptions allowed during the ordering lock', () => {
    expect(['cash_wallet','tokens','food_credit','subscription_entitlement'].map(allowedWhileLocked)).toEqual([false,false,false,true]);
  });
  it('freezes outgoing transfers immediately after due time', () => {
    expect(loanRestrictions([{status:'active',due_at:due}],new Date('2026-11-01T11:00:01Z')).transfersFrozen).toBe(true);
    expect(loanRestrictions([{status:'fully_repaid_late',due_at:due}],new Date('2026-11-05T11:00:00Z')).transfersFrozen).toBe(false);
  });
});