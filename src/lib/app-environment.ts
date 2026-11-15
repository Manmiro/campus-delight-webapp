type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

const MOBILE_APP_USER_AGENT = /Campus\s*Delight(?:\s*(?:App|Mobile|Native))?/i;

/**
 * Returns true when the page is already running as an installed app.
 * Keep this browser-only: callers should invoke it from an effect or event.
 */
export function isInstalledAppEnvironment(
  browserWindow: Pick<Window, "matchMedia"> | undefined =
    typeof window === "undefined" ? undefined : window,
  browserNavigator: NavigatorWithStandalone | undefined =
    typeof navigator === "undefined" ? undefined : navigator,
) {
  if (!browserWindow || !browserNavigator) return false;

  const standalonePwa =
    browserWindow.matchMedia("(display-mode: standalone)").matches ||
    browserNavigator.standalone === true;
  const nativeWrapper =
    "Capacitor" in browserWindow ||
    "ReactNativeWebView" in browserWindow ||
    MOBILE_APP_USER_AGENT.test(browserNavigator.userAgent);

  return standalonePwa || nativeWrapper;
}

export const MOBILE_APP_DISMISSAL_KEY = "campus-delight-mobile-app-dismissed-at";
export const MOBILE_APP_DISMISSAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function getBrowserStorage() {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function wasMobileAppPromptDismissed(
  storage: Pick<Storage, "getItem"> | undefined = getBrowserStorage(),
  now = Date.now(),
) {
  if (!storage) return false;

  const dismissedAt = Number(storage.getItem(MOBILE_APP_DISMISSAL_KEY));
  return Number.isFinite(dismissedAt) && now - dismissedAt < MOBILE_APP_DISMISSAL_WINDOW_MS;
}
