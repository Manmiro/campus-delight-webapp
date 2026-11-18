import { describe, expect, it } from "vitest";

import { downloadPercent, foodieDownloadStatus, handoffProgress } from "@/lib/mobile-download";

describe("mobile APK download progress", () => {
  it("calculates bounded byte progress", () => {
    expect(downloadPercent(250, 1_000)).toBe(25);
    expect(downloadPercent(1_500, 1_000)).toBe(100);
    expect(downloadPercent(100, 0)).toBe(0);
  });

  it("hand-off animation starts at 0, rises, and always lands on 100", () => {
    expect(handoffProgress(0, 2_400)).toBe(0);
    expect(handoffProgress(1_200, 2_400)).toBeGreaterThan(50);
    expect(handoffProgress(1_200, 2_400)).toBeLessThan(100);
    expect(handoffProgress(2_400, 2_400)).toBe(100);
    expect(handoffProgress(9_999, 2_400)).toBe(100);
  });

  it("keeps the foodie copy in sync with the runway milestones", () => {
    expect(foodieDownloadStatus(0)).toContain("Lighting the stove");
    expect(foodieDownloadStatus(26)).toContain("Simmering the Jollof");
    expect(foodieDownloadStatus(61)).toContain("fried plantain");
    expect(foodieDownloadStatus(100, true)).toContain("Food is ready");
  });
});
