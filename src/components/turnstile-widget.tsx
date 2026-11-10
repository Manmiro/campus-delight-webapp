import { useEffect, useRef } from "react";
import { loadTurnstileScript, turnstileFailure, type TurnstileFailure } from "@/lib/turnstile";

// Public site key; the matching secret is validated only on the server.
const SITE_KEY =
  (import.meta.env["VITE_TURNSTILE_SITE_KEY"] as string | undefined) || "0x4AAAAAAF094QazO_Cq50Dz";
type TurnstileWidgetProps = {
  action?: string;
  resetSignal: number;
  onToken: (token: string | null) => void;
  onError: (failure: TurnstileFailure) => void;
};

export function TurnstileWidget({
  resetSignal,
  onToken,
  onError,
  action = "auth",
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onToken, onError });
  useEffect(() => {
    callbacks.current = { onToken, onError };
  }, [onToken, onError]);

  useEffect(() => {
    let disposed = false;
    let remove: (() => void) | undefined;
    const fail = (code: string) => {
      if (disposed) return;
      callbacks.current.onToken(null);
      // Preserve the provider's diagnostic code without logging tokens or keys.
      console.warn("Security verification failed", { code });
      callbacks.current.onError(turnstileFailure(code));
    };
    void loadTurnstileScript()
      .then((api) => {
        if (disposed || !containerRef.current) return;
        try {
          const widgetId = api.render(containerRef.current, {
            sitekey: SITE_KEY,
            action,
            execution: "render",
            callback: (token) => {
              if (!disposed) callbacks.current.onToken(token);
            },
            "error-callback": (code) => {
              fail(code);
              return true;
            },
            "expired-callback": () => {
              if (!disposed) callbacks.current.onToken(null);
            },
            "timeout-callback": () => fail("timeout"),
          });
          remove = () => api.remove(widgetId);
        } catch {
          fail("render");
        }
      })
      .catch(() => fail("script-load"));

    return () => {
      disposed = true;
      // Cloudflare may already have removed an errored widget.
      try {
        remove?.();
      } catch {
        /* No live widget remains. */
      }
    };
    // A retry rebuilds the widget, including when its initial script never loaded.
  }, [action, resetSignal]);

  return <div ref={containerRef} className="flex min-h-[65px] justify-center" />;
}
