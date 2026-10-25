import { smsPhone, verificationMessage } from "@/lib/sms-rules";

export async function sendVerificationSms(apiKey: string, phone: string, code: string) {
  const response = await fetch("https://api.pingram.io/sms", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "campus_delight_phone_verification", to: smsPhone(phone), message: verificationMessage(code) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const raw = await response.text();
    // Providers may echo request values: redact the key, destination and code before logging or returning errors.
    const safe = raw.split(apiKey).join("[redacted]").split(code).join("[redacted]").split(phone).join("[redacted]").split(smsPhone(phone)).join("[redacted]");
    console.error(`Pingram request failed [${response.status}]: ${safe}`);
    throw new Error(`SMS provider failed [${response.status}]: ${safe}`);
  }
  const result: unknown = await response.json();
  if (!result || typeof result !== "object") throw new Error("SMS provider returned an invalid response");
  if ("error" in result && result.error) {
    // A 200 response can also contain a structured provider failure.
    const raw = JSON.stringify(result.error);
    const safe = raw.split(apiKey).join("[redacted]").split(code).join("[redacted]").split(phone).join("[redacted]").split(smsPhone(phone)).join("[redacted]");
    console.error(`Pingram request failed [${response.status}]: ${safe}`);
    throw new Error(`SMS provider failed [${response.status}]: ${safe}`);
  }
  if (!("trackingId" in result) || typeof result.trackingId !== "string") throw new Error("SMS provider did not confirm acceptance");
  return { trackingId: result.trackingId };
}