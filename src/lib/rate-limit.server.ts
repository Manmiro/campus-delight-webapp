import { createHmac } from "node:crypto";
import {
  getRequest,
  getRequestIP,
  setResponseHeader,
  setResponseStatus,
} from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Cloudflare overwrites CF-Connecting-IP at the trusted production edge. */
export async function enforcePublicRequestLimit(scope: string, limit: number): Promise<void> {
  const secret = process.env["RATE_LIMIT_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!secret) throw new Error("Request protection is temporarily unavailable");
  const request = getRequest();
  // Never trust browser-supplied X-Forwarded-For or an unverified JWT as identity.
  const client =
    request.headers.get("cf-connecting-ip") ??
    getRequestIP({ xForwardedFor: false }) ??
    "unknown-client";
  const hash = createHmac("sha256", secret).update(`${scope}:${client}`).digest("hex");
  const { data: allowed, error } = await supabaseAdmin.rpc("consume_request_budget", {
    p_key_hash: hash,
    p_limit: limit,
    p_window_seconds: 60,
  });
  if (error) throw new Error("Request protection is temporarily unavailable");
  if (!allowed) {
    setResponseStatus(429);
    setResponseHeader("Retry-After", "60");
    throw Object.assign(new Error("Too many requests. Please wait a minute and try again."), {
      statusCode: 429,
    });
  }
}
