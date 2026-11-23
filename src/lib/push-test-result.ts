export type PushTestResult = { sent: number; gone: number; failed: number };

/** Turns a push test dispatch result into an honest toast message. */
export function describePushTestResult(
  result: PushTestResult,
  audience: "manager" | "hq",
): { ok: boolean; message: string } {
  if (result.sent > 0) {
    const extra = result.failed > 0 ? ` (${result.failed} device(s) could not be reached)` : "";
    return {
      ok: true,
      message:
        audience === "manager"
          ? `Test alert sent — check the device banner${extra}`
          : `Test alert sent to ${result.sent} device(s)${extra}`,
    };
  }
  if (result.failed > 0)
    return {
      ok: false,
      message:
        "Your device is registered, but the notification service refused the alert. Please try again shortly.",
    };
  if (result.gone > 0)
    return {
      ok: false,
      message: "This device's notification permission expired. Tap Enable again to re-register it.",
    };
  return {
    ok: false,
    message:
      audience === "manager"
        ? "No active device is registered for this outlet"
        : "No active manager or HQ device is registered for this outlet",
  };
}
