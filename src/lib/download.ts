/**
 * Hand a generated file to the visitor. Called synchronously from a click
 * handler: browsers drop user activation after a long await, and Safari drops
 * it fastest, so the blob must already be built by the time this runs.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke later so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** On touch devices prefer the share sheet (iOS offers "Save to Files"). */
export async function deliverFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
    }
  }
  downloadBlob(blob, filename);
}
