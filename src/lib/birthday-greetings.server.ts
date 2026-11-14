// Server-only birthday delivery. This module is loaded only by the cron route.

export const BIRTHDAY_GREETING_CRON_SCHEDULE = "0 23 * * *";
export const BIRTHDAY_GREETING_TIME_ZONE = "Africa/Lagos";

type BirthdayProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  gender: string | null;
  date_of_birth: string | null;
};

export function lagosCalendarDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BIRTHDAY_GREETING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}

export function hasBirthdayInLagos(
  dateOfBirth: string | null | undefined,
  now = new Date(),
): boolean {
  if (!dateOfBirth) return false;
  return dateOfBirth.slice(5, 10) === lagosCalendarDate(now).slice(5, 10);
}

export function birthdayGreetingIdempotencyKey(year: number, userId: string): string {
  return `birthday-greeting:${year}:${userId}`;
}

function lagosYear(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BIRTHDAY_GREETING_TIME_ZONE,
      year: "numeric",
    }).format(now),
  );
}

/** Sends each matching customer once for the Lagos calendar year. */
export async function sendBirthdayGreetings(now = new Date()) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const today = lagosCalendarDate(now);
  const year = lagosYear(now);

  const { data: customerRoles, error: rolesError } = await db
    .from("user_roles")
    .select("user_id")
    .eq("role", "customer");
  if (rolesError) throw new Error(`Could not load customer profiles: ${rolesError.message}`);

  const customerIds = (customerRoles ?? []).map((row: { user_id: string }) => row.user_id);
  if (!customerIds.length) return { date: today, matched: 0, sent: 0, skipped: 0, failed: 0 };

  const { data, error } = await db
    .from("profiles")
    .select("id,email,full_name,gender,date_of_birth")
    .in("id", customerIds)
    .not("date_of_birth", "is", null);
  if (error) throw new Error(`Could not load birthday profiles: ${error.message}`);

  const profiles = ((data ?? []) as BirthdayProfile[]).filter((profile) =>
    hasBirthdayInLagos(profile.date_of_birth, now),
  );
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const profile of profiles) {
    if (!profile.email) {
      skipped++;
      continue;
    }

    const idempotencyKey = birthdayGreetingIdempotencyKey(year, profile.id);
    try {
      const birthYear = profile.date_of_birth ? Number(profile.date_of_birth.slice(0, 4)) : NaN;
      const age = year - birthYear;
      const result = await sendTemplateEmail("birthday-greeting", profile.email, {
        idempotencyKey,
        templateData: {
          name: profile.full_name ?? undefined,
          gender: profile.gender ?? undefined,
          age: age > 0 && age < 120 ? age : undefined,
        },
      });
      if (result.sent) sent++;
      else skipped++;
    } catch (e) {
      failed++;
      console.error("Birthday greeting failed", profile.id, e instanceof Error ? e.message : e);
    }
  }

  return { date: today, matched: profiles.length, sent, skipped, failed };
}
