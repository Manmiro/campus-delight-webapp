export const APK_DOWNLOAD_PATH = "/downloads/campus-delight.apk";

export function downloadPercent(loadedBytes: number, totalBytes: number) {
  if (totalBytes <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((loadedBytes / totalBytes) * 100)));
}

export function foodieDownloadStatus(progress: number, complete = false) {
  if (complete || progress >= 100) {
    return "Food is ready! Tap the downloaded file to install on your phone 🎉";
  }
  if (progress > 60) {
    return "Adding extra fried plantain & packing the delivery...";
  }
  if (progress > 25) {
    return "Simmering the Jollof & packaging your campus perks...";
  }
  return "Lighting the stove & fetching the app file...";
}
