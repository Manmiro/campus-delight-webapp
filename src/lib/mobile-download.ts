export const APK_DOWNLOAD_PATH = "/downloads/campus-delight.apk";
export const APK_FILENAME = "campus-delight.apk";

/** How long the Jollof runway takes to hand the file to the phone's own downloader. */
export const HANDOFF_DURATION_MS = 2_400;

export function downloadPercent(loadedBytes: number, totalBytes: number) {
  if (totalBytes <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((loadedBytes / totalBytes) * 100)));
}

/**
 * Progress of the hand-off animation. The phone's download manager owns the
 * real transfer (background, resumable, no browser memory), so the page only
 * animates the hand-off with an ease-out curve that always lands on 100.
 */
export function handoffProgress(elapsedMs: number, durationMs = HANDOFF_DURATION_MS) {
  if (durationMs <= 0 || elapsedMs >= durationMs) return 100;
  if (elapsedMs <= 0) return 0;
  const t = elapsedMs / durationMs;
  return Math.min(100, Math.round((1 - Math.pow(1 - t, 3)) * 100));
}

export function foodieDownloadStatus(progress: number, complete = false) {
  if (complete || progress >= 100) {
    return "Food is ready! Your phone is downloading it now — watch your notification bar 🎉";
  }
  if (progress > 60) {
    return "Adding extra fried plantain & passing it to your phone...";
  }
  if (progress > 25) {
    return "Simmering the Jollof & packaging your campus perks...";
  }
  return "Lighting the stove & fetching the app file...";
}
