import { describe, expect, it } from "vitest";
import {
  BIRTHDAY_GREETING_CRON_SCHEDULE,
  birthdayGreetingIdempotencyKey,
  hasBirthdayInLagos,
  lagosCalendarDate,
} from "@/lib/birthday-greetings.server";

describe("automated birthday greetings", () => {
  it("runs at midnight Lagos time", () => {
    expect(BIRTHDAY_GREETING_CRON_SCHEDULE).toBe("0 23 * * *");
    expect(lagosCalendarDate(new Date("2026-11-13T23:00:00Z"))).toBe("2026-11-14");
  });

  it("matches only the Lagos month and day", () => {
    const midnight = new Date("2026-10-24T23:00:00Z");
    expect(hasBirthdayInLagos("2004-10-25", midnight)).toBe(true);
    expect(hasBirthdayInLagos("2004-10-24", midnight)).toBe(false);
  });

  it("uses one claim key per customer and Lagos year", () => {
    expect(birthdayGreetingIdempotencyKey(2026, "student-1")).toBe(
      "birthday-greeting:2026:student-1",
    );
    expect(birthdayGreetingIdempotencyKey(2027, "student-1")).not.toBe(
      birthdayGreetingIdempotencyKey(2026, "student-1"),
    );
  });
});
