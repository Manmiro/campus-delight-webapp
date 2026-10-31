const SITE_NAME = "Campus Delight";
const FROM_ADDRESS = "noreply@compusdelight.net";

export interface ManagedAuthEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  label?: string;
  reply_to?: string;
}

/**
 * Sends the already-rendered auth email through Pingram.
 *
 * This module is server-only by filename: the Pingram secret must never be
 * reachable from the browser bundle. Lovable's auth handler calls this through
 * the internal adapter route after it has verified the signed auth webhook.
 */
export async function sendAuthEmailViaPingram(
  input: ManagedAuthEmail,
): Promise<{ trackingId?: string }> {
  const apiKey = process.env["PINGRAM_API_KEY"];
  if (!apiKey) throw new Error("PINGRAM_API_KEY is not configured");

  const response = await fetch("https://api.pingram.io/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: `campus_delight_auth_${(input.label ?? "email").replace(/[^a-z0-9]+/gi, "_")}`,
      to: input.to,
      subject: input.subject,
      html: input.html,
      fromName: SITE_NAME,
      fromAddress: FROM_ADDRESS,
      previewText: input.text.slice(0, 120),
      ...(input.reply_to ? { replyToAddresses: [input.reply_to] } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const raw = await response.text();
  if (!response.ok) {
    console.error(`Pingram auth email failed [${response.status}]`);
    throw new Error(`Email provider failed [${response.status}]`);
  }

  let result: unknown = undefined;
  try {
    result = raw ? JSON.parse(raw) : undefined;
  } catch {
    throw new Error("Email provider returned invalid JSON");
  }

  if (result && typeof result === "object" && "error" in result && result.error) {
    console.error("Pingram auth email was rejected");
    throw new Error("Email provider rejected the message");
  }

  const trackingId =
    result &&
    typeof result === "object" &&
    "trackingId" in result &&
    typeof result.trackingId === "string"
      ? result.trackingId
      : undefined;
  return trackingId ? { trackingId } : {};
}
