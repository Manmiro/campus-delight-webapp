export type TurnstileFailure = { code: string; message: string };
export type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      execution: "render";
      callback: (token: string) => void;
      "error-callback": (code: string) => boolean;
      "expired-callback": () => void;
      "timeout-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let pending: Promise<TurnstileApi> | undefined;

export function turnstileFailure(code: string): TurnstileFailure {
  if (code === "110200")
    return {
      code,
      message:
        "Security verification is not enabled for this website address. Please contact Campus Delight support.",
    };
  if (["110100", "110110", "400020", "400021", "400070"].includes(code))
    return {
      code,
      message:
        "Security verification is not configured correctly. Please contact Campus Delight support.",
    };
  if (code === "110600" || code === "110620" || code === "timeout")
    return { code, message: "The security check timed out. Please try the check again." };
  return {
    code,
    message:
      "The security check could not load. Check your connection, allow challenges.cloudflare.com if it is blocked, and try the check again.",
  };
}

/** Share one script load, but never cache a failed load for the rest of the visit. */
export function loadTurnstileScript(): Promise<TurnstileApi> {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (pending) return pending;
  const attempt = new Promise<TurnstileApi>((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const created = !script;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
    }
    const target = script;
    const cleanup = () => {
      clearTimeout(timeout);
      target.removeEventListener("load", loaded);
      target.removeEventListener("error", failed);
    };
    const fail = () => {
      cleanup();
      target.remove();
      reject(new Error("script-load"));
    };
    const loaded = () => {
      // The load event fires after the API script has executed. Render directly;
      // ready() is unnecessary here and can reject asynchronous script loading.
      if (!window.turnstile?.render) {
        fail();
        return;
      }
      cleanup();
      resolve(window.turnstile);
    };
    const failed = () => fail();
    const timeout = setTimeout(fail, 15000);
    target.addEventListener("load", loaded);
    target.addEventListener("error", failed);
    if (created) document.head.appendChild(target);
  });
  pending = attempt;
  void attempt.catch(() => {
    if (pending === attempt) pending = undefined;
  });
  return attempt;
}
