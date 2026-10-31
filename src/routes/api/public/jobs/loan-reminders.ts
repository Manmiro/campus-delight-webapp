import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/loan-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        try {
          const { sendDueLoanReminders } = await import("@/lib/loan-reminders.server");
          const result = await sendDueLoanReminders();
          return Response.json({ success: true, ...result });
        } catch (e) {
          console.error("Loan reminder job failed", e instanceof Error ? e.message : e);
          return Response.json({ success: false }, { status: 500 });
        }
      },
    },
  },
});
