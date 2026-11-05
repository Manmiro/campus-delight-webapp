import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/loan-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.rpc("process_overdue_loans");
          if (error) throw new Error(error.message);
          const { sendDueLoanReminders, sendOverdueLoanWarnings } = await import("@/lib/loan-reminders.server");
          const noonLagos = new Date().getUTCHours() === 11;
          const result = noonLagos ? await sendDueLoanReminders() : { due: 0, sent: 0, skipped: 0, failed: 0 };
          const warnings = await sendOverdueLoanWarnings();
          return Response.json({ success: true, ...result, warnings }, { status: result.failed || warnings.failed ? 500 : 200 });
        } catch (e) {
          console.error("Loan reminder job failed", e instanceof Error ? e.message : e);
          return Response.json({ success: false }, { status: 500 });
        }
      },
    },
  },
});
