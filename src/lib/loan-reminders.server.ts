// Server-only: sends daily Pay Later repayment reminders. Load dynamically inside handlers.
import { naira } from "@/lib/format";
import { shouldRemind } from "@/lib/loan-reminder-rules";

type DueRow = {
  loan_id: string; customer_id: string; email: string; full_name: string | null; gender: string | null;
  outlet_name: string | null; item_summary: string | null; due_at: string; days_left: number;
  balance_kobo: number; reminder_date: string;
};

export async function sendDueLoanReminders() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const db = supabaseAdmin as any;

  const { data, error } = await db.rpc("due_loan_reminders");
  if (error) throw new Error(`Could not load due loans: ${error.message}`);
  const rows = (data ?? []) as DueRow[];
  let sent = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const balance = Number(row.balance_kobo);
    if (!shouldRemind(row.days_left, balance)) { skipped++; continue; }

    // Claim today's reminder first so retries never send twice on the same day.
    const { data: claimed, error: claimError } = await db
      .from("loan_reminder_sends")
      .upsert({ loan_id: row.loan_id, reminder_date: row.reminder_date, days_left: row.days_left },
        { onConflict: "loan_id,reminder_date", ignoreDuplicates: true })
      .select("loan_id");
    if (claimError || !claimed?.length) { skipped++; continue; }

    try {
      await sendTemplateEmail("loan-reminder", row.email, {
        idempotencyKey: `loan-reminder:${row.loan_id}:${row.reminder_date}`,
        templateData: {
          name: row.full_name ?? undefined,
          daysLeft: row.days_left,
          balance: naira(balance),
          dueDate: new Date(row.due_at).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", year: "numeric" }),
          items: row.item_summary ?? undefined,
          outlet: row.outlet_name ?? undefined,
        },
      });
      sent++;
    } catch (e) {
      failed++;
      console.error("Loan reminder failed", row.loan_id, e instanceof Error ? e.message : e);
      // Release the claim so a later retry today can try again.
      await db.from("loan_reminder_sends").delete().eq("loan_id", row.loan_id).eq("reminder_date", row.reminder_date);
    }
  }
  return { due: rows.length, sent, skipped, failed };
}
