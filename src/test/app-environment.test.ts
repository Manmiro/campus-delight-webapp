import { describe, expect, it } from "vitest";

import {
  isInstalledAppEnvironment,
  MOBILE_APP_DISMISSAL_KEY,
  wasMobileAppPromptDismissed,
} from "@/lib/app-environment";

function browserWindow(options: { standalone?: boolean; capacitive?: boolean } = {}) {
  return {
    matchMedia: () => ({ matches: options.standalone ?? false }),
    ...(options.capacitive ? { Capacitor: {} } : {}),
  } as unknown as Window;
}

function browserNavigator(userAgent = "Mozilla/5.0") {
  return { userAgent } as Navigator;
}

describe("installed app detection", () => {
  it("detects standalone PWA mode and iOS standalone mode", () => {
    expect(isInstalledAppEnvironment(browserWindow({ standalone: true }), browserNavigator())).toBe(true);
    expect(
      isInstalledAppEnvironment(browserWindow(), { ...browserNavigator(), standalone: true } as Navigator & { standalone: boolean }),
    ).toBe(true);
  });

  it("detects native wrapper bridges and the branded app user agent", () => {
    expect(isInstalledAppEnvironment(browserWindow({ capacitive: true }), browserNavigator())).toBe(true);
    expect(isInstalledAppEnvironment(browserWindow(), browserNavigator("CampusDelightApp/1.0"))).toBe(true);
  });

  it("allows a regular browser", () => {
    expect(isInstalledAppEnvironment(browserWindow(), browserNavigator())).toBe(false);
  });
});

describe("mobile prompt dismissal", () => {
  it("respects the seven-day dismissal window", () => {
    const now = 10_000_000;
    const storage = { getItem: (key: string) => (key === MOBILE_APP_DISMISSAL_KEY ? String(now - 1_000) : null) };
    expect(wasMobileAppPromptDismissed(storage, now)).toBe(true);
    expect(wasMobileAppPromptDismissed(storage, now + 7 * 24 * 60 * 60 * 1000)).toBe(false);
  });
});
