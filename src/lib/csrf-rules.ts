const CUSTOM_ORIGINS = new Set([
  "https://campusdelight.net",
  "https://www.campusdelight.net",
]);

export function isTrustedAppOrigin(origin: string, requestUrl: string): boolean {
  const requestOrigin = new URL(requestUrl).origin;
  return origin === requestOrigin ||
    (CUSTOM_ORIGINS.has(requestOrigin) && CUSTOM_ORIGINS.has(origin));
}

/** Same-site alone is not enough: an unrelated subdomain must stay blocked. */
export function isTrustedFetchSite(site: string, request: Request): boolean {
  if (site === "same-origin") return true;
  if (site !== "same-site") return false;
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) return false;
  try {
    return isTrustedAppOrigin(new URL(source).origin, request.url);
  } catch {
    return false;
  }
}