import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Managed HTTP schedule: 0 23 * * * (23:00 UTC = 00:00 in Africa/Lagos).
export const Route = createFileRoute("/api/public/jobs/birthday-greetings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        try {
          const { sendBirthdayGreetings } = await import("@/lib/birthday-greetings.server");
          const result = await sendBirthdayGreetings();
          return Response.json({ success: true, ...result });
        } catch (e) {
          console.error("Birthday greeting job failed", e instanceof Error ? e.message : e);
          return Response.json({ success: false }, { status: 500 });
        }
      },
    },
  },
});
