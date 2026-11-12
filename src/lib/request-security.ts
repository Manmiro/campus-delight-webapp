export const MAX_SERVER_REQUEST_BYTES = 64 * 1024;

/** Bound the raw body before JSON/Seroval/schema validation allocates objects. */
export async function checkRequestSize(
  request: Request,
  maxBytes = MAX_SERVER_REQUEST_BYTES,
): Promise<Response | null> {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method) || !request.body) return null;
  const length = request.headers.get("content-length");
  if (length && Number(length) > maxBytes)
    return new Response("Request body is too large", { status: 413 });
  const reader = request.clone().body!.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return null;
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => {});
        void request.body.cancel().catch(() => {});
        return new Response("Request body is too large", { status: 413 });
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const connectionSources = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://*.lovable.dev",
    "https://*.lovable.app",
    "https://*.lovableproject.com",
  ];
  // Lovable Cloud can expose Supabase through a project-specific lovable.cloud
  // host. Allow the configured public backend, including its realtime transport.
  // Parse it so paths, credentials and untrusted CSP syntax cannot become sources.
  const configuredBackend = import.meta.env["VITE_SUPABASE_URL"];
  if (configuredBackend) {
    try {
      const backend = new URL(configuredBackend);
      if (backend.protocol === "https:" || backend.protocol === "http:") {
        connectionSources.push(backend.origin);
        backend.protocol = backend.protocol === "https:" ? "wss:" : "ws:";
        connectionSources.push(backend.origin);
      }
    } catch {
      // Invalid configuration must not broaden the connection policy.
    }
  }
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.gpteng.co https://*.lovable.dev",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src ${connectionSources.join(" ")}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.paystack.com",
      "frame-ancestors 'self' https://lovable.dev https://*.lovable.dev",
      "upgrade-insecure-requests",
    ].join("; "),
  );
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), clipboard-write=(self)",
  );
  if (new URL(request.url).protocol === "https:")
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  const path = new URL(request.url).pathname;
  if (
    request.method !== "GET" ||
    request.headers.has("authorization") ||
    path.startsWith("/api/") ||
    ["/auth", "/reset-password", "/payment/callback"].includes(path)
  )
    headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
