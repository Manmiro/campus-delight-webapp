import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleTelegramUpdate, verifyTelegramWebhookSecret } =
          await import("@/lib/telegram.server");
        if (!verifyTelegramWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > 256_000) return new Response("Payload too large", { status: 413 });
        try {
          const update = await request.json();
          await handleTelegramUpdate(update);
          return Response.json({ ok: true });
        } catch (error) {
          console.error("Telegram webhook failed", error instanceof Error ? error.message : error);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
