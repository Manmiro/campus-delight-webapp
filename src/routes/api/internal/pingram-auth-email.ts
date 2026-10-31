import { createFileRoute } from "@tanstack/react-router";
import { sendAuthEmailViaPingram, type ManagedAuthEmail } from "@/lib/auth-email-delivery.server";

function isManagedAuthEmail(value: unknown): value is ManagedAuthEmail {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input["to"] === "string" &&
    typeof input["subject"] === "string" &&
    typeof input["html"] === "string" &&
    typeof input["text"] === "string" &&
    (input["label"] === undefined || typeof input["label"] === "string") &&
    (input["reply_to"] === undefined || typeof input["reply_to"] === "string")
  );
}

export const Route = createFileRoute("/api/internal/pingram-auth-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const lovableKey = process.env["LOVABLE_API_KEY"];
        if (!lovableKey || request.headers.get("authorization") !== `Bearer ${lovableKey}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        let input: unknown;
        try {
          input = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        if (!isManagedAuthEmail(input)) {
          return Response.json({ error: "Invalid auth email payload" }, { status: 400 });
        }

        try {
          const result = await sendAuthEmailViaPingram(input);
          return Response.json({ success: true, ...result });
        } catch (error) {
          console.error(
            "Pingram auth email adapter failed",
            error instanceof Error ? error.message : error,
          );
          return Response.json({ error: "Email provider failed" }, { status: 502 });
        }
      },
    },
  },
});
